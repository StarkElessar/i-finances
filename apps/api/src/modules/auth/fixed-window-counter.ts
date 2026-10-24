type CounterEntry = {
	count: number;
	resetAt: number;
};

export const DEFAULT_MAX_COUNTER_KEYS = 10_000;

/**
 * In-memory counters per key. A key's window starts at its first increment and is not extended by later ones.
 * Expired entries are removed first. At capacity, the oldest remaining window is evicted to admit a new key.
 */
export class FixedWindowCounter {
	private readonly entries = new Map<string, CounterEntry>();
	private nextSweepAt = Number.POSITIVE_INFINITY;

	public constructor(
		private readonly windowMilliseconds: number,
		private readonly maxKeys: number = DEFAULT_MAX_COUNTER_KEYS
	) {
		if (!Number.isInteger(maxKeys) || maxKeys < 1) {
			throw new RangeError('maxKeys must be a positive integer.');
		}
	}

	public get size(): number {
		return this.entries.size;
	}

	public get(key: string, now: number): Readonly<CounterEntry> | undefined {
		const entry = this.entries.get(key);

		if (entry !== undefined && entry.resetAt <= now) {
			this.entries.delete(key);

			return undefined;
		}

		return entry;
	}

	public increment(key: string, now: number): void {
		this.sweep(now);

		const entry = this.entries.get(key);

		if (entry === undefined || entry.resetAt <= now) {
			if (this.entries.size >= this.maxKeys) {
				const oldestKey = this.entries.keys().next().value;

				if (oldestKey !== undefined) {
					this.entries.delete(oldestKey);
				}
			}

			const resetAt = now + this.windowMilliseconds;

			this.entries.set(key, {
				count: 1,
				resetAt
			});
			this.nextSweepAt = Math.min(this.nextSweepAt, resetAt);

			return;
		}

		entry.count += 1;
	}

	public decrement(key: string, now: number): void {
		const entry = this.entries.get(key);

		if (entry === undefined || entry.resetAt <= now) {
			return;
		}

		entry.count -= 1;

		if (entry.count <= 0) {
			this.entries.delete(key);
		}
	}

	public delete(key: string): void {
		this.entries.delete(key);
	}

	public clear(): void {
		this.entries.clear();
		this.nextSweepAt = Number.POSITIVE_INFINITY;
	}

	private sweep(now: number): void {
		if (now < this.nextSweepAt) {
			return;
		}

		this.nextSweepAt = Number.POSITIVE_INFINITY;

		for (const [key, entry] of this.entries) {
			if (entry.resetAt <= now) {
				this.entries.delete(key);
			}
			else {
				this.nextSweepAt = Math.min(this.nextSweepAt, entry.resetAt);
			}
		}
	}
}
