type CounterEntry = {
	count: number;
	resetAt: number;
};

/**
 * In-memory counters per key. A key's window starts at its first increment and is not extended by later ones.
 * Expired entries are dropped on read and swept periodically so that unbounded key spaces cannot grow forever.
 */
export class FixedWindowCounter {
	private readonly entries = new Map<string, CounterEntry>();
	private nextSweepAt = 0;

	public constructor(private readonly windowMilliseconds: number) {}

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
			this.entries.set(key, {
				count: 1,
				resetAt: now + this.windowMilliseconds
			});

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
		this.nextSweepAt = 0;
	}

	private sweep(now: number): void {
		if (now < this.nextSweepAt) {
			return;
		}

		this.nextSweepAt = now + this.windowMilliseconds;

		for (const [key, entry] of this.entries) {
			if (entry.resetAt <= now) {
				this.entries.delete(key);
			}
		}
	}
}
