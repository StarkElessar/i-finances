import { getPasswordSignInConfig, type PasswordVerificationAdmission, PasswordVerificationLimiter } from '@/modules/auth';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function release(admission: PasswordVerificationAdmission): void {
	expect(admission.allowed).toBe(true);

	if (admission.allowed) {
		admission.release();
	}
}

describe('PasswordVerificationLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('admits eight operations, queues only sixty-four and hands slots over in FIFO order', async () => {
		const limiter = new PasswordVerificationLimiter(getPasswordSignInConfig({}));
		const active = await Promise.all(Array.from({ length: 8 }, () => limiter.acquire()));
		const order: number[] = [];
		const queued = Array.from({ length: 64 }, (_, index) => limiter.acquire().then((admission) => {
			order.push(index);

			return admission;
		}));

		expect(await limiter.acquire()).toEqual({ allowed: false, retryAfterSeconds: 2 });
		expect(vi.getTimerCount()).toBe(64);
		release(active[0]);
		release(await queued[0]);
		release(await queued[1]);
		expect(order).toEqual([0, 1]);

		for (const waiting of queued.slice(2)) {
			release(await waiting);
		}

		active.slice(1).forEach(release);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('expires waiting requests without releasing a running operation and reuses queue capacity', async () => {
		const limiter = new PasswordVerificationLimiter({ maxConcurrent: 1, maxQueue: 1, queueTimeoutMilliseconds: 2_000 });
		const active = await limiter.acquire();
		const expired = limiter.acquire();

		await vi.advanceTimersByTimeAsync(2_000);
		expect(await expired).toEqual({ allowed: false, retryAfterSeconds: 2 });

		const next = limiter.acquire();

		expect(await limiter.acquire()).toEqual({ allowed: false, retryAfterSeconds: 2 });
		release(active);
		release(await next);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('checks the deadline on handover even when the timeout callback has not run', async () => {
		let now = 0;
		const setTimer = vi.fn((callback: () => void, delay: number) => setTimeout(callback, delay));
		const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
		const limiter = new PasswordVerificationLimiter({
			clearTimer,
			maxConcurrent: 1,
			maxQueue: 2,
			now: () => now,
			queueTimeoutMilliseconds: 1_000,
			setTimer
		});
		const active = await limiter.acquire();
		const expired = limiter.acquire();

		now = 500;

		const fresh = limiter.acquire();

		now = 1_000;
		release(active);
		expect(await expired).toEqual({ allowed: false, retryAfterSeconds: 1 });
		release(await fresh);
		expect(setTimer).toHaveBeenCalledTimes(2);
		expect(clearTimer).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('supports no queue and an idempotent release without creating extra slots', async () => {
		const limiter = new PasswordVerificationLimiter({ maxConcurrent: 1, maxQueue: 0, queueTimeoutMilliseconds: 500 });
		const first = await limiter.acquire();

		expect(await limiter.acquire()).toEqual({ allowed: false, retryAfterSeconds: 1 });
		release(first);
		release(first);

		const second = await limiter.acquire();

		expect(await limiter.acquire()).toEqual({ allowed: false, retryAfterSeconds: 1 });
		release(second);
	});
});
