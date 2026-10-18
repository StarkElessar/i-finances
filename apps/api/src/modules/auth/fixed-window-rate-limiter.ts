import { FixedWindowCounter } from './fixed-window-counter';

export type FixedWindowRateLimiterOptions = {
	/** Requests allowed per key within one window. */
	maxRequests: number;
	windowMilliseconds: number;
};

export type FixedWindowRateLimitResult = {
	allowed: boolean;
	/** Seconds until the window of the key ends; set only when the request is refused. */
	retryAfterSeconds?: number;
};

/**
 * Counts every request per key (not only failures, unlike `LoginRateLimiter`) in a fixed window and refuses the ones
 * above the limit. Check and count happen in one synchronous step, so parallel requests cannot all slip through.
 * A refused request is not counted: the block ends with the window that started it.
 *
 * Used for the open Telegram sign-in routes (Р11): `start` and `complete` keyed by the client address from
 * `readClientIp`.
 */
export class FixedWindowRateLimiter {
	private readonly counter: FixedWindowCounter;
	private readonly maxRequests: number;

	public constructor(options: FixedWindowRateLimiterOptions) {
		if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
			throw new RangeError('maxRequests must be a positive integer.');
		}

		this.counter = new FixedWindowCounter(options.windowMilliseconds);
		this.maxRequests = options.maxRequests;
	}

	public tryConsume(key: string, now: number = Date.now()): FixedWindowRateLimitResult {
		const entry = this.counter.get(key, now);

		if (entry !== undefined && entry.count >= this.maxRequests) {
			return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
		}

		this.counter.increment(key, now);

		return { allowed: true };
	}

	public reset(): void {
		this.counter.clear();
	}
}
