const PASSWORD_SIGN_IN_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const PASSWORD_SIGN_IN_MAX_ATTEMPTS = 5;

type PasswordSignInRateLimitInput = {
	ipAddress?: string;
	username: string;
	now?: number;
};

type PasswordSignInAttemptRecord = {
	count: number;
	resetAt: number;
};

/**
 * Result of checking the password sign-in throttling bucket.
 */
export type PasswordSignInRateLimitResult = {
	allowed: boolean;
	retryAfterSeconds?: number;
};

const passwordSignInAttempts = new Map<string, PasswordSignInAttemptRecord>();

/**
 * Builds a stable throttling key without storing submitted passwords.
 */
function createPasswordSignInRateLimitKey(input: PasswordSignInRateLimitInput): string {
	return `${input.ipAddress ?? 'unknown'}:${input.username}`;
}

/**
 * Resolves the timestamp used by production code and deterministic tests.
 */
function resolveNow(input: PasswordSignInRateLimitInput): number {
	return input.now ?? Date.now();
}

/**
 * Removes an expired throttling bucket.
 */
function clearExpiredAttemptRecord(key: string, now: number): void {
	const record = passwordSignInAttempts.get(key);

	if (record && record.resetAt <= now) {
		passwordSignInAttempts.delete(key);
	}
}

/**
 * Checks whether another password sign-in attempt is currently allowed.
 */
export function checkPasswordSignInRateLimit(input: PasswordSignInRateLimitInput): PasswordSignInRateLimitResult {
	const key = createPasswordSignInRateLimitKey(input);
	const now = resolveNow(input);

	clearExpiredAttemptRecord(key, now);

	const record = passwordSignInAttempts.get(key);

	if (!record || record.count < PASSWORD_SIGN_IN_MAX_ATTEMPTS) {
		return { allowed: true };
	}

	return {
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000))
	};
}

/**
 * Records a failed password sign-in attempt for the current throttling window.
 */
export function recordPasswordSignInFailure(input: PasswordSignInRateLimitInput): void {
	const key = createPasswordSignInRateLimitKey(input);
	const now = resolveNow(input);

	clearExpiredAttemptRecord(key, now);

	const record = passwordSignInAttempts.get(key);

	if (!record) {
		passwordSignInAttempts.set(key, {
			count: 1,
			resetAt: now + PASSWORD_SIGN_IN_WINDOW_MILLISECONDS
		});
		return;
	}

	record.count += 1;
}

/**
 * Clears throttling after a successful password sign-in.
 */
export function clearPasswordSignInRateLimit(input: PasswordSignInRateLimitInput): void {
	passwordSignInAttempts.delete(createPasswordSignInRateLimitKey(input));
}

/**
 * Clears all buckets for deterministic tests.
 */
export function resetPasswordSignInRateLimits(): void {
	passwordSignInAttempts.clear();
}
