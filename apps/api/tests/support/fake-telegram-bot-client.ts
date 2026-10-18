import type {
	AnswerCallbackQueryInput,
	EditMessageTextInput,
	GetUpdatesInput,
	SendMessageInput,
	SetWebhookInput,
	TelegramBotClient,
	TelegramUpdate
} from '@/modules/telegram';

export type FakeTelegramCall =
	| { method: 'answerCallbackQuery'; input: AnswerCallbackQueryInput }
	| { method: 'deleteWebhook' }
	| { method: 'editMessageText'; input: EditMessageTextInput }
	| { method: 'getUpdates'; input: GetUpdatesInput }
	| { method: 'sendMessage'; input: SendMessageInput }
	| { method: 'setWebhook'; input: SetWebhookInput };

/**
 * In-memory stand-in for the Bot API client. Tests never reach Telegram: this records every call, hands out queued
 * updates to `getUpdates` and can be told to fail the next calls of a method (`failNext('sendMessage', error)`).
 */
export class FakeTelegramBotClient implements TelegramBotClient {
	public readonly calls: FakeTelegramCall[] = [];
	readonly #failures = new Map<FakeTelegramCall['method'], unknown[]>();
	readonly #queuedUpdates: TelegramUpdate[] = [];
	#nextMessageId = 1;

	public callsTo<M extends FakeTelegramCall['method']>(method: M): Extract<FakeTelegramCall, { method: M }>[] {
		return this.calls.filter((call): call is Extract<FakeTelegramCall, { method: M }> => call.method === method);
	}

	/** The next call of `method` rejects with `error`; call it again to queue more failures. */
	public failNext(method: FakeTelegramCall['method'], error: unknown): void {
		this.#failures.set(method, [...(this.#failures.get(method) ?? []), error]);
	}

	/** Updates the next `getUpdates` calls return (those with `update_id` at or above the requested offset). */
	public queueUpdates(...updates: TelegramUpdate[]): void {
		this.#queuedUpdates.push(...updates);
	}

	public answerCallbackQuery(input: AnswerCallbackQueryInput): Promise<void> {
		return this.#record({ input, method: 'answerCallbackQuery' }, undefined);
	}

	public deleteWebhook(): Promise<void> {
		return this.#record({ method: 'deleteWebhook' }, undefined);
	}

	public editMessageText(input: EditMessageTextInput): Promise<void> {
		return this.#record({ input, method: 'editMessageText' }, undefined);
	}

	public async getUpdates(input: GetUpdatesInput): Promise<TelegramUpdate[]> {
		this.calls.push({ input, method: 'getUpdates' });
		this.#throwQueuedFailure('getUpdates');

		const ready = this.#queuedUpdates.filter((update) => update.update_id >= input.offset);

		this.#queuedUpdates.length = 0;

		if (ready.length > 0) {
			return ready;
		}

		// Like a real long poll: wait until stopped, then answer empty.
		await new Promise<void>((resolve) => {
			if (input.signal?.aborted === true) {
				resolve();

				return;
			}

			input.signal?.addEventListener('abort', () => resolve(), { once: true });
		});

		return [];
	}

	public sendMessage(input: SendMessageInput): Promise<{ messageId: number }> {
		const messageId = this.#nextMessageId;

		this.#nextMessageId += 1;

		return this.#record({ input, method: 'sendMessage' }, { messageId });
	}

	public setWebhook(input: SetWebhookInput): Promise<void> {
		return this.#record({ input, method: 'setWebhook' }, undefined);
	}

	// Async on purpose: a queued failure must surface as a rejection, like a real client failure.
	async #record<T>(call: FakeTelegramCall, result: T): Promise<T> {
		this.calls.push(call);
		this.#throwQueuedFailure(call.method);

		return result;
	}

	#throwQueuedFailure(method: FakeTelegramCall['method']): void {
		const failures = this.#failures.get(method);
		const failure = failures?.shift();

		if (failure !== undefined) {
			// eslint-disable-next-line @typescript-eslint/only-throw-error -- tests queue arbitrary rejection values
			throw failure;
		}
	}
}
