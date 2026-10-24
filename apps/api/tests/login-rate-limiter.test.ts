import { LoginRateLimiter } from '@/modules/auth';
import { FixedWindowCounter } from '@/modules/auth/fixed-window-counter';
import { loginAddressKey } from '@/modules/auth/login-address-key';

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

	it('does not count a blocked attempt towards the address counter', () => {
		const attempt = {
			ipAddress: '127.0.0.1',
			now: 1000,
			username: 'sergei'
		};

		for (let index = 0; index < 5; index += 1) {
			expect(limiter.tryReserve(attempt).allowed).toBe(true);
		}

		// Thirty blocked attempts would push the address counter (limit 30) over its limit if they were counted.
		for (let index = 0; index < 30; index += 1) {
			expect(limiter.tryReserve(attempt).allowed).toBe(false);
		}

		expect(limiter.tryReserve({ ...attempt, username: 'anna' }).allowed).toBe(true);
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

	it('reports the longest of the windows that triggered the block', () => {
		limiter = new LoginRateLimiter({ maxAttempts: 1, maxAttemptsPerIp: 2 });

		// The address window starts at 0, the window of the (address, 'b') pair 100 seconds later.
		limiter.tryReserve({ ipAddress: '203.0.113.7', now: 0, username: 'a' });
		limiter.tryReserve({ ipAddress: '203.0.113.7', now: 100_000, username: 'b' });

		// Both counters block now: the address ends at 900 s, the pair at 1000 s. 200 s have passed.
		expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 200_000, username: 'b' })).toEqual({
			allowed: false,
			retryAfterSeconds: 800
		});
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

describe('LoginRateLimiter per-address limit', () => {
	let limiter: LoginRateLimiter;

	beforeEach(() => {
		limiter = new LoginRateLimiter();
	});

	function spray(count: number, ipAddress = '203.0.113.7', now = 1000): void {
		for (let index = 0; index < count; index += 1) {
			limiter.tryReserve({ ipAddress, now, username: `victim-${index}` });
		}
	}

	it('shares the address budget inside an IPv6 /64 but keeps adjacent networks independent', () => {
		limiter = new LoginRateLimiter({ maxAttemptsPerIp: 2 });

		expect(limiter.tryReserve({ ipAddress: '2001:db8:abcd:1234::1', now: 1000, username: 'first' }).allowed).toBe(true);
		expect(limiter.tryReserve({
			ipAddress: '2001:0db8:abcd:1234:ffff:1:2:3', now: 1000, username: 'second'
		}).allowed).toBe(true);
		expect(limiter.tryReserve({ ipAddress: '2001:db8:abcd:1234::99', now: 1000, username: 'third' })).toEqual({
			allowed: false, retryAfterSeconds: 900
		});
		expect(limiter.tryReserve({ ipAddress: '2001:db8:abcd:1235::1', now: 1000, username: 'third' }).allowed).toBe(true);
	});

	it('returns exactly one address attempt after a successful login from the same IPv6 /64', () => {
		limiter = new LoginRateLimiter({ maxAttemptsPerIp: 2 });
		limiter.tryReserve({ ipAddress: '2001:db8::1', now: 1000, username: 'first' });
		limiter.tryReserve({ ipAddress: '2001:db8::2', now: 1000, username: 'second' });
		limiter.recordSuccess({ ipAddress: '2001:db8::2', now: 1000, username: 'second' });

		expect(limiter.tryReserve({ ipAddress: '2001:db8::3', now: 1000, username: 'third' }).allowed).toBe(true);
		expect(limiter.tryReserve({ ipAddress: '2001:db8::4', now: 1000, username: 'fourth' }).allowed).toBe(false);
	});

	it('stops one address that walks through many usernames', () => {
		spray(30);

		expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: 'victim-new' })).toEqual({
			allowed: false,
			retryAfterSeconds: 900
		});
	});

	it('allows the thirtieth attempt and does not touch other addresses', () => {
		spray(29);

		expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: 'victim-29' }).allowed).toBe(true);
		expect(limiter.tryReserve({ ipAddress: '198.51.100.1', now: 1000, username: 'victim-0' }).allowed).toBe(true);
	});

	it('is temporary and ends with the window of the first attempt', () => {
		spray(30);

		expect(limiter.tryReserve({
			ipAddress: '203.0.113.7',
			now: 1000 + WINDOW_MILLISECONDS + 1,
			username: 'victim-new'
		}).allowed).toBe(true);
	});

	it('gives back one attempt after a successful sign-in, so shared addresses are not starved by valid logins', () => {
		for (let index = 0; index < 100; index += 1) {
			expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: `user-${index}` }).allowed).toBe(true);
			limiter.recordSuccess({ ipAddress: '203.0.113.7', now: 1000, username: `user-${index}` });
		}
	});

	it('does not count a blocked attempt', () => {
		spray(30);
		spray(100, '203.0.113.7', 500_000);

		expect(limiter.tryReserve({
			ipAddress: '203.0.113.7',
			now: 1000 + WINDOW_MILLISECONDS + 1,
			username: 'victim-new'
		}).allowed).toBe(true);
	});

	it('is configurable and can be switched off', () => {
		limiter = new LoginRateLimiter({ maxAttemptsPerIp: 2 });
		spray(2);

		expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: 'other' }).allowed).toBe(false);

		limiter = new LoginRateLimiter({ maxAttemptsPerIp: Number.POSITIVE_INFINITY });
		spray(200);

		expect(limiter.tryReserve({ ipAddress: '203.0.113.7', now: 1000, username: 'other' }).allowed).toBe(true);
	});

	it('does not pool attempts with an unknown address', () => {
		for (let index = 0; index < 100; index += 1) {
			expect(limiter.tryReserve({ now: 1000, username: `user-${index}` }).allowed).toBe(true);
		}
	});
});

describe('FixedWindowCounter', () => {
	it('bounds the default capacity even when every key is active', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS);

		for (let index = 0; index < 10_100; index += 1) {
			counter.increment(`key-${index}`, 1000);
		}

		expect(counter.size).toBe(10_000);
		expect(counter.get('key-99', 1000)).toBeUndefined();
		expect(counter.get('key-100', 1000)?.count).toBe(1);
		expect(counter.get('key-10099', 1000)?.count).toBe(1);
	});

	it('evicts the weakest counter when full and still admits new keys', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS, 2);

		counter.increment('oldest', 1000);
		counter.increment('second', 2000);
		counter.increment('oldest', 3000);
		expect(counter.size).toBe(2);
		expect(counter.get('oldest', 3000)?.count).toBe(2);
		counter.increment('new', 4000);

		expect(counter.size).toBe(2);
		expect(counter.get('second', 4000)).toBeUndefined();
		expect(counter.get('oldest', 4000)?.count).toBe(2);
		expect(counter.get('new', 4000)?.count).toBe(1);
	});

	it('evicts the oldest of equally weak counters', () => {
		const counter = new FixedWindowCounter(WINDOW_MILLISECONDS, 2);

		counter.increment('first', 1000);
		counter.increment('second', 2000);
		counter.increment('new', 3000);

		expect(counter.get('first', 3000)).toBeUndefined();
		expect(counter.get('second', 3000)?.count).toBe(1);
		expect(counter.get('new', 3000)?.count).toBe(1);
	});

	it('removes expired entries before evicting active ones, even after clock adjustments', () => {
		const counter = new FixedWindowCounter(1000, 3);

		counter.increment('active', 500);
		counter.increment('expired-oldest', 0);
		counter.increment('expired-second', 100);
		counter.increment('new', 1200);

		expect(counter.size).toBe(2);
		expect(counter.get('active', 1200)?.count).toBe(1);
		expect(counter.get('expired-oldest', 1200)).toBeUndefined();
		expect(counter.get('expired-second', 1200)).toBeUndefined();
		expect(counter.get('new', 1200)?.count).toBe(1);
	});

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

describe('LoginRateLimiter memory bound', () => {
	it('bounds all three counters while allowing new users when all entries are active', () => {
		const limiter = new LoginRateLimiter({ maxCounterKeys: 3 });

		for (let index = 0; index < 200; index += 1) {
			expect(limiter.tryReserve({ ipAddress: `203.0.113.${index + 1}`, now: 1000, username: `user-${index}` }).allowed).toBe(true);
			expect(limiter.size).toBeLessThanOrEqual(9);
		}

		const recent = { ipAddress: '203.0.113.200', now: 1000, username: 'user-199' };

		for (let index = 0; index < 4; index += 1) {
			expect(limiter.tryReserve(recent).allowed).toBe(true);
		}

		expect(limiter.tryReserve(recent).allowed).toBe(false);
		limiter.reset();
		expect(limiter.size).toBe(0);
	});
});

describe('LoginRateLimiter flooding with fresh keys', () => {
	it('keeps the blocked username of a victim when the counters are flooded with one-hit keys', () => {
		const limiter = new LoginRateLimiter({ maxAttemptsPerUsername: 3, maxCounterKeys: 5 });
		const victim = { ipAddress: '203.0.113.1', now: 1000, username: 'victim' };

		for (let attempt = 0; attempt < 3; attempt += 1) {
			expect(limiter.tryReserve({ ...victim, ipAddress: `198.51.100.${attempt + 1}` }).allowed).toBe(true);
		}

		for (let index = 0; index < 500; index += 1) {
			limiter.tryReserve({ ipAddress: `192.0.2.${index % 250}`, now: 1000, username: `junk-${index}` });
		}

		expect(limiter.tryReserve(victim).allowed).toBe(false);
	});
});

describe('LoginRateLimiter.check', () => {
	it('reports a block without counting the attempt', () => {
		const limiter = new LoginRateLimiter({ maxAttempts: 2 });
		const input = { ipAddress: '203.0.113.7', now: 1000, username: 'sergei' };

		for (let index = 0; index < 50; index += 1) {
			expect(limiter.check(input)).toEqual({ allowed: true });
		}

		expect(limiter.size).toBe(0);
		expect(limiter.tryReserve(input).allowed).toBe(true);
		expect(limiter.tryReserve(input).allowed).toBe(true);
		expect(limiter.check(input)).toMatchObject({ allowed: false, retryAfterSeconds: expect.any(Number) });
		expect(limiter.check({ ...input, username: 'someone-else' })).toEqual({ allowed: true });
	});
});

describe('loginAddressKey', () => {
	it.each([
		['2001:db8:abcd:1234::1', '2001:db8:abcd:1234::/64'],
		['2001:0db8:0000:0000:abcd:1234:0:1', '2001:db8:0:0::/64'],
		['2001:db8::abcd:1234', '2001:db8:0:0::/64'],
		['2001:db8:abcd::', '2001:db8:abcd:0::/64'],
		['2001::1', '2001:0:0:0::/64'],
		['::1', '0:0:0:0::/64'],
		['::', '0:0:0:0::/64'],
		['::192.0.2.1', '0:0:0:0::/64'],
		['2001:db8:0:1:2:3:192.0.2.1', '2001:db8:0:1::/64'],
		['fe80::1%eth0', 'fe80:0:0:0::/64'],
		['203.0.113.7', '203.0.113.7'],
		[undefined, undefined]
	])('groups %s as %s', (address, key) => {
		expect(loginAddressKey(address)).toBe(key);
	});
});
