import { LoginRateLimiter } from '@/modules/auth';
import { FixedWindowCounter } from '@/modules/auth/fixed-window-counter';

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

	describe('per-username limit', () => {
		function failFromManyAddresses(count: number, username = 'sergei', now = 1000): void {
			for (let index = 0; index < count; index += 1) {
				limiter.recordFailure({
					ipAddress: `198.51.100.${index + 1}`,
					now,
					username
				});
			}
		}

		it('is not bypassed by rotating the source address', () => {
			failFromManyAddresses(20);

			expect(limiter.check({
				ipAddress: '203.0.113.99',
				now: 1000,
				username: 'sergei'
			})).toEqual({
				allowed: false,
				retryAfterSeconds: 900
			});
		});

		it('still allows an attempt after nineteen failures', () => {
			failFromManyAddresses(19);

			expect(limiter.check({ ipAddress: '203.0.113.99', now: 1000, username: 'sergei' }).allowed).toBe(true);
		});

		it('does not block other usernames', () => {
			failFromManyAddresses(20);

			expect(limiter.check({ ipAddress: '203.0.113.99', now: 1000, username: 'anna' }).allowed).toBe(true);
		});

		it('is temporary: the block ends with the window of the first failure', () => {
			failFromManyAddresses(20);

			expect(limiter.check({
				ipAddress: '203.0.113.99',
				now: 1000 + WINDOW_MILLISECONDS + 1,
				username: 'sergei'
			}).allowed).toBe(true);
		});

		it('is not reset by a successful sign-in from one address', () => {
			failFromManyAddresses(20);
			limiter.clear({ ipAddress: '198.51.100.1', now: 1000, username: 'sergei' });

			expect(limiter.check({ ipAddress: '198.51.100.1', now: 1000, username: 'sergei' }).allowed).toBe(false);
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
});
