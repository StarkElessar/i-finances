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

		try {
			await this.#handler.handle(update);
		}
		catch (error) {
			console.error(`Telegram update ${update.update_id} failed in the handler.`, error);
		}

		return 'handled';
	}
}
