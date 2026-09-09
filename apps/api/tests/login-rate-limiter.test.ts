import { LoginRateLimiter } from '@/modules/auth';

import { beforeEach, describe, expect, it } from 'vitest';

const WINDOW_MILLISECONDS = 15 * 60 * 1000;

describe('LoginRateLimiter', () => {
	let limiter: LoginRateLimiter;

	beforeEach(() => {
		limiter = new LoginRateLimiter();
	});

	it('blocks the sixth failed attempt in one window', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			expect(limiter.check(attempt).allowed).toBe(true);
			limiter.recordFailure(attempt);
		}

		expect(limiter.check(attempt)).toEqual({
			allowed: false,
			retryAfterSeconds: 900
		});
	});

	it('resets after the window expires', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			limiter.recordFailure(attempt);
		}

		expect(limiter.check({
			...attempt,
			now: attempt.now + WINDOW_MILLISECONDS + 1
		}).allowed).toBe(true);
	});

	it('clears failures after a successful sign-in', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		limiter.recordFailure(attempt);
		limiter.clear(attempt);

		expect(limiter.check(attempt).allowed).toBe(true);
	});
});
