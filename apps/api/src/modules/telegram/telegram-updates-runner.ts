import { TelegramApiError } from './telegram-api-error';
import type { TelegramBotClient } from './telegram-bot-client';
import { TelegramRateLimitedError } from './telegram-rate-limited-error';
import type { TelegramSecret } from './telegram-secret';
import type { TelegramUpdateDispatcher } from './telegram-update-dispatcher';
import type { TelegramUpdatesMode } from './telegram-updates-mode';

const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_LONG_POLL_SECONDS = 25;
const CONFLICT_STATUS = 409;

export type TelegramUpdatesRunnerOptions = {
	botClient: TelegramBotClient;
	dispatcher: TelegramUpdateDispatcher;
	/** Long poll duration of `getUpdates`. */
	longPollSeconds?: number;
	mode: TelegramUpdatesMode;
	retryDelayMilliseconds?: number;
	/** Required in `webhook` mode. */
	webhook?: { secret: TelegramSecret; url: string };
};

/**
 * Starts and stops the source of bot updates.
 *
 * - `webhook`: registers the webhook (URL and secret token) with Telegram. Telegram pushes updates to the webhook
 *   controller afterwards, nothing runs in the process.
 * - `polling`: long-polls `getUpdates` with a growing offset until `stop()`. It never deletes a webhook: with the
 *   production token on a developer machine `getUpdates` then fails with 409 and production keeps its updates, instead
 *   of polling silently taking the bot over (ServicePlanner lesson 4). A dev bot left with a webhook needs a one-off
 *   manual `deleteWebhook`.
 * - `off`: does nothing.
 *
 * `start()` returns at once and never throws: a Telegram outage must not stop the API from booting, so failures are
 * logged and retried in the background (waiting `retry_after` when Telegram asks for it). A bot has one consumer: a
 * `getUpdates` from a developer machine with the production token would steal the updates, so use a dev bot.
 */
export class TelegramUpdatesRunner {
	readonly #abortController = new AbortController();
	readonly #botClient: TelegramBotClient;
	readonly #dispatcher: TelegramUpdateDispatcher;
	readonly #longPollSeconds: number;
	readonly #mode: TelegramUpdatesMode;
	readonly #retryDelayMilliseconds: number;
	readonly #webhook: { secret: TelegramSecret; url: string } | undefined;
	#running: Promise<void> = Promise.resolve();

	public constructor(options: TelegramUpdatesRunnerOptions) {
		if (options.mode === 'webhook' && options.webhook === undefined) {
			throw new Error('The webhook mode needs the webhook URL and secret.');
		}

		this.#botClient = options.botClient;
		this.#dispatcher = options.dispatcher;
		this.#longPollSeconds = options.longPollSeconds ?? DEFAULT_LONG_POLL_SECONDS;
		this.#mode = options.mode;
		this.#retryDelayMilliseconds = options.retryDelayMilliseconds ?? DEFAULT_RETRY_DELAY_MS;
		this.#webhook = options.webhook;
	}

	public start(): void {
		if (this.#mode === 'webhook') {
			this.#running = this.#registerWebhook();
		}
		else if (this.#mode === 'polling') {
			this.#running = this.#poll();
		}
	}

	/** Aborts the in-flight long poll and waits for the loop to end. */
	public async stop(): Promise<void> {
		this.#abortController.abort();
		await this.#running;
	}

	async #registerWebhook(): Promise<void> {
		const webhook = this.#webhook;

		if (webhook === undefined) {
			return;
		}

		await this.#retryUntilDone('setWebhook', () => this.#botClient.setWebhook({
			secretToken: webhook.secret.reveal(),
			url: webhook.url
		}));
	}

	async #poll(): Promise<void> {
		let offset = 0;

		while (!this.#isStopped()) {
			try {
				const updates = await this.#botClient.getUpdates({
					offset,
					signal: this.#abortController.signal,
					timeoutSeconds: this.#longPollSeconds
				});

				for (const update of updates) {
					// Advance first: whatever happens to this update, Telegram must not send it again.
					offset = Math.max(offset, update.update_id + 1);
					await this.#dispatcher.dispatch(update);
				}
			}
			catch (error) {
				if (this.#isStopped()) {
					return;
				}

				await this.#waitAfterFailure('getUpdates', error);
			}
		}
	}

	async #retryUntilDone(name: string, task: () => Promise<void>): Promise<void> {
		while (!this.#isStopped()) {
			try {
				await task();

				return;
			}
			catch (error) {
				if (this.#isStopped()) {
					return;
				}

				await this.#waitAfterFailure(name, error);
			}
		}
	}

	#isStopped(): boolean {
		return this.#abortController.signal.aborted;
	}

	async #waitAfterFailure(name: string, error: unknown): Promise<void> {
		const isConflict = error instanceof TelegramApiError && error.errorCode === CONFLICT_STATUS;
		const delay = error instanceof TelegramRateLimitedError
			? Math.max(error.retryAfterSeconds * 1000, this.#retryDelayMilliseconds)
			: this.#retryDelayMilliseconds;

		const hint = isConflict
			? ' Another consumer holds the updates of this bot: a webhook (is this the production bot?) or a second getUpdates.'
				+ ' Polling never deletes a webhook; use a dev bot, or call deleteWebhook by hand if this is one.'
			: '';

		console.error(`Telegram ${name} failed, retrying in ${delay} ms.${hint}`, error);
		await this.#sleep(delay);
	}

	#sleep(milliseconds: number): Promise<void> {
		const { signal } = this.#abortController;

		return new Promise((resolve) => {
			if (signal.aborted) {
				resolve();

				return;
			}

			const done = (): void => {
				clearTimeout(timer);
				signal.removeEventListener('abort', done);
				resolve();
			};
			const timer = setTimeout(done, milliseconds);

			signal.addEventListener('abort', done, { once: true });
		});
	}
}
