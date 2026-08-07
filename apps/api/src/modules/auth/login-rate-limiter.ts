const DEFAULT_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

export type LoginRateLimitInput = {
	ipAddress?: string;
	now?: number;
	username: string;
};

export type LoginRateLimitResult = {
	allowed: boolean;
	retryAfterSeconds?: number;
};

type AttemptRecord = {
	count: number;
	resetAt: number;
};

export type LoginRateLimiterOptions = {
	maxAttempts?: number;
	windowMilliseconds?: number;
};

export class LoginRateLimiter {
	private readonly attempts = new Map<string, AttemptRecord>();
	private readonly maxAttempts: number;
	private readonly windowMilliseconds: number;

	public constructor(options: LoginRateLimiterOptions = {}) {
		this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		this.windowMilliseconds = options.windowMilliseconds ?? DEFAULT_WINDOW_MILLISECONDS;
	}

	public check(input: LoginRateLimitInput): LoginRateLimitResult {
		const key = this.createKey(input);
		const now = input.now ?? Date.now();

		this.clearExpired(key, now);

		const record = this.attempts.get(key);

		if (record === undefined || record.count < this.maxAttempts) {
			return { allowed: true };
		}

		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000))
		};
	}

	public recordFailure(input: LoginRateLimitInput): void {
		const key = this.createKey(input);
		const now = input.now ?? Date.now();

		this.clearExpired(key, now);

		const record = this.attempts.get(key);

		if (record === undefined) {
			this.attempts.set(key, {
				count: 1,
				resetAt: now + this.windowMilliseconds
			});
			return;
		}

		record.count += 1;
	}

	public clear(input: LoginRateLimitInput): void {
		this.attempts.delete(this.createKey(input));
	}

	public reset(): void {
		this.attempts.clear();
	}

	private createKey(input: LoginRateLimitInput): string {
		return `${input.ipAddress ?? 'unknown'}:${input.username}`;
	}

	private clearExpired(key: string, now: number): void {
		const record = this.attempts.get(key);

		if (record !== undefined && record.resetAt <= now) {
			this.attempts.delete(key);
		}
	}
}
