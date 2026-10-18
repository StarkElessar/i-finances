import type { ProcessedUpdateIds } from './processed-update-ids';
import type { TelegramUpdateHandler } from './telegram-update-handler';
import type { TelegramUpdate } from './telegram-update-schema';

export type TelegramDispatchOutcome = 'duplicate' | 'handled' | 'ignored';

/**
 * The single path every update takes, from the webhook or from polling: drop kinds the bot does not read, drop
 * repeats of an update id, then hand over to the handler. A failing handler is logged (update id and error only, never
 * the update, which carries names and text) and swallowed, because answering Telegram with an error only makes it
 * redeliver the same update.
 */
export class TelegramUpdateDispatcher {
	readonly #handler: TelegramUpdateHandler;
	readonly #inFlight = new Set<Promise<void>>();
	readonly #processedUpdateIds: ProcessedUpdateIds;

	public constructor(handler: TelegramUpdateHandler, processedUpdateIds: ProcessedUpdateIds) {
		this.#handler = handler;
		this.#processedUpdateIds = processedUpdateIds;
	}

	public async dispatch(update: TelegramUpdate): Promise<TelegramDispatchOutcome> {
		if (update.message === undefined && update.callback_query === undefined) {
			return 'ignored';
		}

		if (!this.#processedUpdateIds.markIfNew(update.update_id)) {
			return 'duplicate';
		}

		const handling = this.#handle(update);

		this.#inFlight.add(handling);

		try {
			await handling;
		}
		finally {
			this.#inFlight.delete(handling);
		}

		return 'handled';
	}

	/**
	 * Waits until the handlers that are still running have finished, but not longer than `timeoutMilliseconds`.
	 * Called at shutdown, after the server stopped accepting requests and polling stopped, so that a confirmation
	 * that is half written (a request confirmed, the bot message not yet edited) is not cut off by `process.exit`.
	 * Returns `true` when everything finished in time.
	 */
	public async drain(timeoutMilliseconds: number): Promise<boolean> {
		if (this.#inFlight.size === 0) {
			return true;
		}

		let timer: NodeJS.Timeout | undefined;
		const timedOut = new Promise<false>((resolve) => {
			timer = setTimeout(() => resolve(false), timeoutMilliseconds);
		});

		try {
			return await Promise.race([Promise.allSettled([...this.#inFlight]).then(() => true as const), timedOut]);
		}
		finally {
			clearTimeout(timer);
		}
	}

	async #handle(update: TelegramUpdate): Promise<void> {
		try {
			await this.#handler.handle(update);
		}
		catch (error) {
			console.error(`Telegram update ${update.update_id} failed in the handler.`, error);
		}
	}
}
