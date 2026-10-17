import { FixedWindowCounter } from './fixed-window-counter';

const DEFAULT_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_ATTEMPTS_PER_USERNAME = 20;
const DEFAULT_MAX_ATTEMPTS_PER_IP = 30;

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
	/** Failures allowed from one address across all usernames within one window. Ignored when the address is unknown. */
	maxAttemptsPerIp?: number;
	/** Failures allowed per username from any address within one window. Must exceed `maxAttempts`. */
	maxAttemptsPerUsername?: number;
	windowMilliseconds?: number;
};

/**
 * Three independent fixed-window limits. The pair limit stops one source from hammering one account. The username limit
 * stops a source that rotates its address. The address limit stops one source that walks through many usernames
 * (password spraying); it never looks at the username. All blocks are temporary: they end when the window of the first counted
 * failure ends, so a stranger can lock an account for at most one window at a time and never for good.
 */
export class LoginRateLimiter {
	private readonly maxAttempts: number;
	private readonly maxAttemptsPerIp: number;
	private readonly maxAttemptsPerUsername: number;
	private readonly addresses: FixedWindowCounter;
	private readonly pairs: FixedWindowCounter;
	private readonly usernames: FixedWindowCounter;

	public constructor(options: LoginRateLimiterOptions = {}) {
		const windowMilliseconds = options.windowMilliseconds ?? DEFAULT_WINDOW_MILLISECONDS;

		this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		this.maxAttemptsPerIp = options.maxAttemptsPerIp ?? DEFAULT_MAX_ATTEMPTS_PER_IP;
		this.maxAttemptsPerUsername = options.maxAttemptsPerUsername ?? DEFAULT_MAX_ATTEMPTS_PER_USERNAME;
		this.addresses = new FixedWindowCounter(windowMilliseconds);
		this.pairs = new FixedWindowCounter(windowMilliseconds);
		this.usernames = new FixedWindowCounter(windowMilliseconds);
	}

	/**
	 * Counts the attempt up front and tells whether it may proceed. Check and count happen in one synchronous step, so
	 * concurrent requests cannot all pass the check before any of them has been counted. Callers must not verify the
	 * password when this returns `allowed: false`, and call `recordSuccess` if the attempt turns out to be valid.
	 */
	public tryReserve(input: LoginRateLimitInput): LoginRateLimitResult {
		const now = input.now ?? Date.now();
		const pairKey = this.createPairKey(input);
		const pair = this.pairs.get(pairKey, now);
		const username = this.usernames.get(input.username, now);
		const address = input.ipAddress === undefined ? undefined : this.addresses.get(input.ipAddress, now);
		const blockedUntil = [
			address !== undefined && address.count >= this.maxAttemptsPerIp ? address.resetAt : undefined,
			pair !== undefined && pair.count >= this.maxAttempts ? pair.resetAt : undefined,
			username !== undefined && username.count >= this.maxAttemptsPerUsername ? username.resetAt : undefined
		].filter((resetAt) => resetAt !== undefined);

		if (blockedUntil.length > 0) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((Math.max(...blockedUntil) - now) / 1000))
			};
		}

		this.pairs.increment(pairKey, now);
		this.usernames.increment(input.username, now);

		if (input.ipAddress !== undefined) {
			this.addresses.increment(input.ipAddress, now);
		}

		return { allowed: true };
	}

	/**
	 * Gives back a reserved attempt that turned out to be a valid sign-in and forgives the pair. The username counter
	 * only gets this one attempt back, not a reset: otherwise the owner's own login would hand a guessing attacker
	 * a fresh budget.
	 */
	public recordSuccess(input: LoginRateLimitInput): void {
		this.pairs.delete(this.createPairKey(input));
		this.usernames.decrement(input.username, input.now ?? Date.now());

		if (input.ipAddress !== undefined) {
			this.addresses.decrement(input.ipAddress, input.now ?? Date.now());
		}
	}

	public reset(): void {
		this.addresses.clear();
		this.pairs.clear();
		this.usernames.clear();
	}

	private createPairKey(input: LoginRateLimitInput): string {
		return `${input.ipAddress ?? 'unknown'}:${input.username}`;
	}
}
