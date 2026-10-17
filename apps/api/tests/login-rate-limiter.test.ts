import { LoginRateLimiter } from '@/modules/auth';
import { FixedWindowCounter } from '@/modules/auth/fixed-window-counter';

import { beforeEach, describe, expect, it } from 'vitest';

const WINDOW_MILLISECONDS = 15 * 60 * 1000;

describe('LoginRateLimiter', () => {
	let limiter: LoginRateLimiter;

	beforeEach(() => {
		limiter = new LoginRateLimiter();
	});

	it('allows five attempts in one window and blocks the sixth', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			expect(limiter.tryReserve(attempt).allowed).toBe(true);
		}

		expect(limiter.tryReserve(attempt)).toEqual({
			allowed: false,
			retryAfterSeconds: 900
		});
	});

	it('does not count a blocked attempt, so the block still ends with the first window', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			limiter.tryReserve(attempt);
		}

		for (let index = 0; index < 50; index += 1) {
			limiter.tryReserve({ ...attempt, now: 500_000 });
		}

		expect(limiter.tryReserve({ ...attempt, now: 1000 + WINDOW_MILLISECONDS + 1 }).allowed).toBe(true);
	});

	it('keeps other sources and the username counter untouched while one source is blocked', () => {
		for (let index = 0; index < 50; index += 1) {
			limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: 'sergei' });
		}

		// Only the five allowed attempts were counted for the username, not all fifty.
		for (let index = 0; index < 15; index += 1) {
			expect(limiter.tryReserve({ ipAddress: `198.51.100.${index + 1}`, now: 1000, username: 'sergei' }).allowed).toBe(true);
		}

		expect(limiter.tryReserve({ ipAddress: '198.51.100.99', now: 1000, username: 'sergei' }).allowed).toBe(false);
	});

	it('resets after the window expires', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			limiter.tryReserve(attempt);
		}

		expect(limiter.tryReserve({
			...attempt,
			now: attempt.now + WINDOW_MILLISECONDS + 1
		}).allowed).toBe(true);
	});

	it('forgives the pair after a successful sign-in', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 4; index += 1) {
			limiter.tryReserve(attempt);
		}

		limiter.tryReserve(attempt);
		limiter.recordSuccess(attempt);

		for (let index = 0; index < 5; index += 1) {
			expect(limiter.tryReserve(attempt).allowed).toBe(true);
		}
	});

	describe('per-username limit', () => {
		function attemptFromManyAddresses(count: number, username = 'sergei', now = 1000): void {
			for (let index = 0; index < count; index += 1) {
				limiter.tryReserve({
					ipAddress: `198.51.100.${index + 1}`,
					now,
					username
				});
			}
		}

		it('is not bypassed by rotating the source address', () => {
			attemptFromManyAddresses(20);

			expect(limiter.tryReserve({
				ipAddress: '203.0.113.99',
				now: 1000,
				username: 'sergei'
			})).toEqual({
				allowed: false,
				retryAfterSeconds: 900
			});
		});

		it('can be switched off for limiters that are already keyed by one account', () => {
			limiter = new LoginRateLimiter({ maxAttemptsPerUsername: Number.POSITIVE_INFINITY });

			for (let index = 0; index < 100; index += 1) {
				expect(limiter.tryReserve({ ipAddress: `198.51.100.${index + 1}`, now: 1000, username: 'user-id' }).allowed).toBe(true);
			}
		});

		it('still allows an attempt after nineteen attempts', () => {
			attemptFromManyAddresses(19);

			expect(limiter.tryReserve({ ipAddress: '203.0.113.99', now: 1000, username: 'sergei' }).allowed).toBe(true);
		});

		it('does not block other usernames', () => {
			attemptFromManyAddresses(20);

			expect(limiter.tryReserve({ ipAddress: '203.0.113.99', now: 1000, username: 'anna' }).allowed).toBe(true);
		});

		it('is temporary: the block ends with the window of the first attempt', () => {
			attemptFromManyAddresses(20);

			expect(limiter.tryReserve({
				ipAddress: '203.0.113.99',
				now: 1000 + WINDOW_MILLISECONDS + 1,
				username: 'sergei'
			}).allowed).toBe(true);
		});

		it('is not reset by a successful sign-in, only the successful attempt is given back', () => {
			attemptFromManyAddresses(20);
			limiter.recordSuccess({ ipAddress: '198.51.100.1', now: 1000, username: 'sergei' });

			// 19 attempts remain counted: exactly one more is allowed, then the block is back.
			expect(limiter.tryReserve({ ipAddress: '203.0.113.1', now: 1000, username: 'sergei' }).allowed).toBe(true);
			expect(limiter.tryReserve({ ipAddress: '203.0.113.2', now: 1000, username: 'sergei' }).allowed).toBe(false);
		});
	});
});

describe('FixedWindowCounter', () => {
	it('sweeps expired keys so that random usernames cannot grow memory forever', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS);

		for (let index = 0; index < 100; index += 1) {
			counter.increment(`user-${index}`, 1000);
		}

		expect(counter.size).toBe(100);

		counter.increment('fresh', 1000 + WINDOW_MILLISECONDS + 1);

		expect(counter.size).toBe(1);
	});

	it('starts a new window for a key whose window has passed', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS);

		counter.increment('key', 1000);
		counter.increment('key', 1000);
		counter.increment('key', 1000 + WINDOW_MILLISECONDS + 1);

		expect(counter.get('key', 1000 + WINDOW_MILLISECONDS + 1)?.count).toBe(1);
	});

	it('removes a key once its count drops to zero', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS);

		counter.increment('key', 1000);
		counter.decrement('key', 1000);

		expect(counter.size).toBe(0);
	});
});
