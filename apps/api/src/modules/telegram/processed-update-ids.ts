/**
 * Remembers the most recent update ids so that a redelivered update is not handled twice.
 *
 * Telegram redelivers an update when the webhook answered late or with a non-2xx status. The memory is bounded
 * (oldest ids are forgotten first) and lives in the process only: after a restart a redelivery can pass once more, so
 * handlers must still be idempotent on their own (A3 does this with conditional updates). The id is recorded before
 * the handler runs, which also stops two concurrent deliveries of the same update.
 */
export class ProcessedUpdateIds {
	readonly #capacity: number;
	readonly #ids = new Set<number>();

	public constructor(capacity = 10_000) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError('The capacity of processed update ids must be a positive integer.');
		}

		this.#capacity = capacity;
	}

	/** Records the id and returns `true` the first time it is seen, `false` for a repeat. */
	public markIfNew(updateId: number): boolean {
		if (this.#ids.has(updateId)) {
			return false;
		}

		this.#ids.add(updateId);

		if (this.#ids.size > this.#capacity) {
			const oldest = this.#ids.values().next();

			if (oldest.done !== true) {
				this.#ids.delete(oldest.value);
			}
		}

		return true;
	}
}
