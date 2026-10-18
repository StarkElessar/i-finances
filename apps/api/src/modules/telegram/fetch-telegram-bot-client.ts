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
import type { TelegramSecret } from './telegram-secret';
import { TelegramTimeoutError } from './telegram-timeout-error';
import { type TelegramUpdate, telegramUpdateSchema } from './telegram-update-schema';
import { ALLOWED_TELEGRAM_UPDATES } from './telegram-updates';

const DEFAULT_BASE_URL = 'https://api.telegram.org';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
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
	/** Injectable for tests. */
	fetch?: typeof fetch;
	requestTimeoutMilliseconds?: number;
	token: TelegramSecret;
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

/**
 * Bot API over `fetch`. The token lives only in the request URL, so every error built here leaves the URL and the
 * original transport error out. No automatic retries: a 429 is reported with `retryAfterSeconds` and the caller decides.
 */
export class FetchTelegramBotClient implements TelegramBotClient {
	readonly #baseUrl: string;
	readonly #fetch: typeof fetch;
	readonly #requestTimeoutMilliseconds: number;
	readonly #token: TelegramSecret;

	public constructor(options: FetchTelegramBotClientOptions) {
		this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.#fetch = options.fetch ?? fetch;
		this.#requestTimeoutMilliseconds = options.requestTimeoutMilliseconds ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#token = options.token;
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
		return this.#call('getUpdates', {
			allowed_updates: ALLOWED_TELEGRAM_UPDATES,
			offset: input.offset,
			timeout: input.timeoutSeconds
		}, updateListSchema, {
			signal: input.signal,
			timeoutMilliseconds: input.timeoutSeconds * 1000 + LONG_POLL_MARGIN_MS
		});
	}

	async #call<T>(
		method: string,
		body: object,
		resultSchema: z.ZodType<T>,
		options: { signal?: AbortSignal; timeoutMilliseconds?: number } = {}
	): Promise<T> {
		const timeoutMilliseconds = options.timeoutMilliseconds ?? this.#requestTimeoutMilliseconds;
		const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds);
		const signal = options.signal === undefined ? timeoutSignal : AbortSignal.any([timeoutSignal, options.signal]);
		let response: Response;
		let text: string;

		try {
			response = await this.#fetch(`${this.#baseUrl}/bot${this.#token.reveal()}/${method}`, {
				body: JSON.stringify(body),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
				signal
			});
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
