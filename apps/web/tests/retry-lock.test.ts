import { createRetryLock } from '@/features/security/model/create-retry-lock';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createRetryLock', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('rests for the named wait and then unlocks once', () => {
		const lock = createRetryLock();
		const onUnlock = vi.fn();

		expect(lock.lockFor(240, onUnlock)).toBe(true);
		vi.advanceTimersByTime(239_999);
		expect(onUnlock).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onUnlock).toHaveBeenCalledTimes(1);
	});

	it('replaces a running wait with a newer one', () => {
		const lock = createRetryLock();
		const first = vi.fn();
		const second = vi.fn();

		lock.lockFor(60, first);
		lock.lockFor(120, second);
		vi.advanceTimersByTime(120_000);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('starts no wait after the form is gone (a 429 answered after the dialog was closed)', () => {
		const lock = createRetryLock();
		const onUnlock = vi.fn();

		lock.dispose();
		expect(lock.lockFor(240, onUnlock)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(240_000);
		expect(onUnlock).not.toHaveBeenCalled();
	});

	it('clears a running wait on dispose', () => {
		const lock = createRetryLock();
		const onUnlock = vi.fn();

		lock.lockFor(240, onUnlock);
		lock.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});
});
