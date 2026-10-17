import { FixedWindowCounter } from './fixed-window-counter';

const DEFAULT_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_ATTEMPTS_PER_USERNAME = 20;

export type LoginRateLimitInput = {
	ipAddress?: string;
	now?: number;
	username: string;
};

export type LoginRateLimitResult = {
	allowed: boolean;
	retryAfterSeconds?: number;
};

export type LoginRateLimiterOptions = {
	/** Failures allowed per `ip + username` pair within one window. */
	maxAttempts?: number;
	/** Failures allowed per username from any address within one window. Must exceed `maxAttempts`. */
	maxAttemptsPerUsername?: number;
	windowMilliseconds?: number;
};

/**
 * Two independent fixed-window limits. The pair limit stops one source from hammering one account. The username limit
 * stops a source that rotates its address. Both blocks are temporary: they end when the window of the first counted
 * failure ends, so a stranger can lock an account for at most one window at a time and never for good.
 */
export class LoginRateLimiter {
	private readonly maxAttempts: number;
	private readonly maxAttemptsPerUsername: number;
	private readonly pairs: FixedWindowCounter;
	private readonly usernames: FixedWindowCounter;

	public constructor(options: LoginRateLimiterOptions = {}) {
		const windowMilliseconds = options.windowMilliseconds ?? DEFAULT_WINDOW_MILLISECONDS;

		this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		this.maxAttemptsPerUsername = options.maxAttemptsPerUsername ?? DEFAULT_MAX_ATTEMPTS_PER_USERNAME;
		this.pairs = new FixedWindowCounter(windowMilliseconds);
		this.usernames = new FixedWindowCounter(windowMilliseconds);
	}

	public check(input: LoginRateLimitInput): LoginRateLimitResult {
		const now = input.now ?? Date.now();
		const pair = this.pairs.get(this.createPairKey(input), now);
		const username = this.usernames.get(input.username, now);
		const blockedUntil = [
			pair !== undefined && pair.count >= this.maxAttempts ? pair.resetAt : undefined,
			username !== undefined && username.count >= this.maxAttemptsPerUsername ? username.resetAt : undefined
		].filter((resetAt) => resetAt !== undefined);

		if (blockedUntil.length === 0) {
			return { allowed: true };
		}

		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil((Math.max(...blockedUntil) - now) / 1000))
		};
	}

	public recordFailure(input: LoginRateLimitInput): void {
		const now = input.now ?? Date.now();

		this.pairs.increment(this.createPairKey(input), now);
		this.usernames.increment(input.username, now);
	}

	/**
	 * Forgives the pair after a successful sign-in. The username counter is left alone on purpose: otherwise the
	 * owner's own login would give a guessing attacker a fresh budget.
	 */
	public clear(input: LoginRateLimitInput): void {
		this.pairs.delete(this.createPairKey(input));
	}

	public reset(): void {
		this.pairs.clear();
		this.usernames.clear();
	}

	private createPairKey(input: LoginRateLimitInput): string {
		return `${input.ipAddress ?? 'unknown'}:${input.username}`;
	}
}
