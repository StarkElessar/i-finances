import { z } from 'zod';

import { TelegramApiError } from './telegram-api-error';
import type {
	AnswerCallbackQueryInput,
	EditMessageTextInput,
	GetUpdatesInput,
	SendMessageInput,
	SetWebhookInput,
	TelegramBotClient,
	TelegramInlineKeyboard
} from './telegram-bot-client';
import { TelegramForbiddenError } from './telegram-forbidden-error';
import { TelegramNetworkError } from './telegram-network-error';
import { TelegramRateLimitedError } from './telegram-rate-limited-error';
import {
	createTelegramRetryConnection,
	type TelegramFetchDispatcher,
	type TelegramRetryConnection
} from './telegram-retry-connection';
import type { TelegramSecret } from './telegram-secret';
import { TelegramTimeoutError } from './telegram-timeout-error';
import { type TelegramUpdate, telegramUpdateSchema } from './telegram-update-schema';
import { ALLOWED_TELEGRAM_UPDATES } from './telegram-updates';

const DEFAULT_BASE_URL = 'https://api.telegram.org';
/** One attempt of an ordinary method. Telegram answers these in tens of milliseconds, so a longer wait is a dead socket. */
const DEFAULT_REQUEST_TIMEOUT_MS = 4000;
/** Retries after the first attempt, on a timeout, a network error or a short 429 only. */
const DEFAULT_MAX_RETRIES = 2;
/** Pause before the first, and then before the second retry. */
const DEFAULT_RETRY_BACKOFF_MS = [200, 600];
/** Attempts, pauses and `retry_after` waits of one call together; Telegram's webhook delivery must not wait longer. */
const DEFAULT_TOTAL_BUDGET_MS = 12_000;
/** A longer `retry_after` is the caller's business: the call fails with `TelegramRateLimitedError` at once. */
const DEFAULT_MAX_RETRY_AFTER_MS = 5000;
/** Added to the long poll duration so that Telegram's own timeout fires before ours. */
const LONG_POLL_MARGIN_MS = 10_000;
const FALLBACK_RETRY_AFTER_SECONDS = 1;

const envelopeSchema = z.object({
	description: z.string().optional(),
	error_code: z.number().int().optional(),
	ok: z.boolean(),
	parameters: z.object({ retry_after: z.number().nonnegative().optional() }).optional(),
	result: z.unknown().optional()
});

const sentMessageSchema = z.object({ message_id: z.number().int() });
const updateListSchema = z.array(telegramUpdateSchema);

export type FetchTelegramBotClientOptions = {
	/** Defaults to `https://api.telegram.org`; tests never use the real host. */
	baseUrl?: string;
	/** Opens the private connection pool of one retry. Injectable for tests. */
	createRetryConnection?: () => TelegramRetryConnection;
	/** Injectable for tests. */
	fetch?: typeof fetch;
	/** Receives one line per retry: method, attempt, error class and code, never the URL, the token or message text. */
	log?: (line: string) => void;
	/** Longest `retry_after` that is waited out; a longer one is reported to the caller. */
	maxRetryAfterMilliseconds?: number;
	/** Retries after the first attempt; 0 turns retrying off. */
	maxRetries?: number;
	/** One attempt of an ordinary method (not `getUpdates`, whose time follows its long poll). */
	requestTimeoutMilliseconds?: number;
	/** Pauses before the 1st, 2nd... retry; the last one is reused when there are more retries than pauses. */
	retryBackoffMilliseconds?: number[];
	token: TelegramSecret;
	/** Upper bound of one ordinary call, all attempts and pauses included. */
	totalBudgetMilliseconds?: number;
};

function toReplyMarkup(keyboard: TelegramInlineKeyboard | undefined): { reply_markup?: object } {
	if (keyboard === undefined || keyboard.length === 0) {
		return {};
	}

	return {
		reply_markup: {
			inline_keyboard: keyboard.map((row) => row.map((button) => ({
				callback_data: button.callbackData,
				text: button.text,
				url: button.url
			})))
		}
	};
}

function readErrorCode(error: unknown): string | undefined {
	for (const candidate of [error, error instanceof Error ? error.cause : undefined]) {
		if (typeof candidate === 'object' && candidate !== null && 'code' in candidate && typeof candidate.code === 'string') {
			return candidate.code;
		}
	}

	return undefined;
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

/**
 * Bot API over `fetch`. The token lives only in the request URL, so every error built here leaves the URL and the
 * original transport error out.
 *
 * Ordinary methods are tried up to `maxRetries + 1` times, and only after a timeout, a network error or a 429 with a
 * short `retry_after`. Every retry goes through a private connection pool: a socket of the shared keep-alive pool may be
 * dead and hang until the timeout. Other answers (4xx, 403, a long 429) are reported at once and the caller decides.
 * The whole call stays within `totalBudgetMilliseconds`. `getUpdates` is never retried here: the polling loop does it.
 * A retried `sendMessage` can post the same text twice when the first attempt reached Telegram but its answer was lost
 * (see `development/decisions/telegram-client-retries.md`).
 */
export class FetchTelegramBotClient implements TelegramBotClient {
	readonly #baseUrl: string;
	readonly #createRetryConnection: () => TelegramRetryConnection;
	readonly #fetch: typeof fetch;
	readonly #log: (line: string) => void;
	readonly #maxRetries: number;
	readonly #maxRetryAfterMilliseconds: number;
	readonly #requestTimeoutMilliseconds: number;
	readonly #retryBackoffMilliseconds: number[];
	readonly #token: TelegramSecret;
	readonly #totalBudgetMilliseconds: number;

	public constructor(options: FetchTelegramBotClientOptions) {
		this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.#createRetryConnection = options.createRetryConnection ?? createTelegramRetryConnection;
		this.#fetch = options.fetch ?? fetch;
		this.#log = options.log ?? ((line) => {
			console.warn(line);
		});
		this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.#maxRetryAfterMilliseconds = options.maxRetryAfterMilliseconds ?? DEFAULT_MAX_RETRY_AFTER_MS;
		this.#requestTimeoutMilliseconds = options.requestTimeoutMilliseconds ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#retryBackoffMilliseconds = options.retryBackoffMilliseconds ?? DEFAULT_RETRY_BACKOFF_MS;
		this.#token = options.token;
		this.#totalBudgetMilliseconds = options.totalBudgetMilliseconds ?? DEFAULT_TOTAL_BUDGET_MS;
	}

	public async sendMessage(input: SendMessageInput): Promise<{ messageId: number }> {
		const result = await this.#call('sendMessage', {
			chat_id: input.chatId,
			text: input.text,
			...toReplyMarkup(input.keyboard)
		}, sentMessageSchema);

		return { messageId: result.message_id };
	}

	public async editMessageText(input: EditMessageTextInput): Promise<void> {
		await this.#call('editMessageText', {
			chat_id: input.chatId,
			message_id: input.messageId,
			text: input.text,
			...toReplyMarkup(input.keyboard)
		}, z.unknown());
	}

	public async answerCallbackQuery(input: AnswerCallbackQueryInput): Promise<void> {
		await this.#call('answerCallbackQuery', {
			callback_query_id: input.callbackQueryId,
			...(input.text === undefined ? {} : { text: input.text })
		}, z.unknown());
	}

	public async setWebhook(input: SetWebhookInput): Promise<void> {
		await this.#call('setWebhook', {
			allowed_updates: ALLOWED_TELEGRAM_UPDATES,
			secret_token: input.secretToken,
			url: input.url
		}, z.unknown());
	}

	public async deleteWebhook(): Promise<void> {
		await this.#call('deleteWebhook', {}, z.unknown());
	}

	public getUpdates(input: GetUpdatesInput): Promise<TelegramUpdate[]> {
		return this.#attempt('getUpdates', {
			allowed_updates: ALLOWED_TELEGRAM_UPDATES,
			offset: input.offset,
			timeout: input.timeoutSeconds
		}, updateListSchema, {
			signal: input.signal,
			timeoutMilliseconds: input.timeoutSeconds * 1000 + LONG_POLL_MARGIN_MS
		});
	}

	/** An ordinary method: the retry loop around `#attempt`. */
	async #call<T>(method: string, body: object, resultSchema: z.ZodType<T>): Promise<T> {
		const startedAt = Date.now();
		let lastError: unknown;

		for (let attempt = 1; ; attempt += 1) {
			const remaining = this.#remaining(startedAt);

			// A pause that ended late (a busy event loop) may have eaten the rest of the budget. `AbortSignal.timeout`
			// throws a RangeError on a negative delay, so the caller gets the error of the last attempt instead.
			if (attempt > 1 && remaining <= 0) {
				throw lastError;
			}

			// The first attempt uses the shared keep-alive pool; every retry gets a pool of its own.
			const connection = attempt === 1 ? undefined : this.#createRetryConnection();

			try {
				return await this.#attempt(method, body, resultSchema, {
					dispatcher: connection?.dispatcher,
					timeoutMilliseconds: Math.min(this.#requestTimeoutMilliseconds, remaining)
				});
			}
			catch (error) {
				const delay = this.#delayBeforeRetry(error, attempt, this.#remaining(startedAt));

				if (delay === undefined) {
					throw error;
				}

				lastError = error;

				this.#log(this.#describeRetry(method, attempt, error, delay));
				await sleep(delay);
			}
			finally {
				await connection?.close();
			}
		}
	}

	#remaining(startedAt: number): number {
		return this.#totalBudgetMilliseconds - (Date.now() - startedAt);
	}

	/** How long to wait before the next attempt, or `undefined` when the error is final. */
	#delayBeforeRetry(error: unknown, attempt: number, remainingMilliseconds: number): number | undefined {
		if (attempt > this.#maxRetries) {
			return undefined;
		}

		const backoff = this.#retryBackoffMilliseconds[Math.min(attempt, this.#retryBackoffMilliseconds.length) - 1] ?? 0;
		let delay: number;

		if (error instanceof TelegramTimeoutError || error instanceof TelegramNetworkError) {
			delay = backoff;
		}
		else if (error instanceof TelegramRateLimitedError) {
			const requested = error.retryAfterSeconds * 1000;

			if (requested > this.#maxRetryAfterMilliseconds) {
				return undefined;
			}

			delay = Math.max(requested, backoff);
		}
		else {
			return undefined;
		}

		// Nothing would be left for another attempt after the pause: report the error instead of waiting for nothing.
		return delay < remainingMilliseconds ? delay : undefined;
	}

	#describeRetry(method: string, attempt: number, error: unknown, delay: number): string {
		const code = error instanceof TelegramNetworkError ? error.code : undefined;
		const errorClass = error instanceof Error ? error.name : 'Error';
		const detail = code === undefined ? errorClass : `${errorClass}, ${code}`;

		return `Telegram ${method} attempt ${attempt} of ${this.#maxRetries + 1} failed (${detail}), retrying in ${delay} ms.`;
	}

	/** One request. `dispatcher` is the private pool of a retry; without it `fetch` uses the shared one. */
	async #attempt<T>(
		method: string,
		body: object,
		resultSchema: z.ZodType<T>,
		options: { dispatcher?: TelegramFetchDispatcher; signal?: AbortSignal; timeoutMilliseconds: number }
	): Promise<T> {
		const { timeoutMilliseconds } = options;
		const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds);
		const signal = options.signal === undefined ? timeoutSignal : AbortSignal.any([timeoutSignal, options.signal]);
		let response: Response;
		let text: string;

		try {
			const init: RequestInit & { dispatcher?: TelegramFetchDispatcher } = {
				body: JSON.stringify(body),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
				signal
			};

			if (options.dispatcher !== undefined) {
				init.dispatcher = options.dispatcher;
			}

			response = await this.#fetch(`${this.#baseUrl}/bot${this.#token.reveal()}/${method}`, init);
			text = await response.text();
		}
		catch (error) {
			if (timeoutSignal.aborted) {
				throw new TelegramTimeoutError(method, timeoutMilliseconds);
			}

			throw new TelegramNetworkError(method, readErrorCode(error));
		}

		return this.#interpret(method, response, text, resultSchema);
	}

	#interpret<T>(method: string, response: Response, text: string, resultSchema: z.ZodType<T>): T {
		let json: unknown;

		try {
			json = JSON.parse(text);
		}
		catch {
			// A proxy error page, for example. The body is not echoed: it is not ours to log.
			throw new TelegramApiError(method, response.status, 'the answer is not JSON');
		}

		const envelope = envelopeSchema.safeParse(json);

		if (!envelope.success) {
			throw new TelegramApiError(method, response.status, 'the answer is not a Bot API response');
		}

		if (!envelope.data.ok) {
			const errorCode = envelope.data.error_code ?? response.status;
			const description = envelope.data.description ?? 'no description';

			if (errorCode === 403) {
				throw new TelegramForbiddenError(method, description);
			}

			if (errorCode === 429) {
				const retryAfter = envelope.data.parameters?.retry_after ?? FALLBACK_RETRY_AFTER_SECONDS;

				throw new TelegramRateLimitedError(method, description, retryAfter);
			}

			throw new TelegramApiError(method, errorCode, description);
		}

		const result = resultSchema.safeParse(envelope.data.result);

		if (!result.success) {
			throw new TelegramApiError(method, response.status, 'the result has an unexpected shape');
		}

		return result.data;
	}
}
