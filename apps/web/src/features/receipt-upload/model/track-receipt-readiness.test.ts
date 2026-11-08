// @vitest-environment jsdom
import type { ReceiptImportStatus } from '@/entities/receipt-import';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TrackedReceipt, trackReceiptReadiness } from './track-receipt-readiness';

function receipt(id: string, status: ReceiptImportStatus): TrackedReceipt {
	return { id, status };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('trackReceiptReadiness', () => {
	it('keeps polling while any tracked receipt is processed, then reports once', async () => {
		const list = vi.fn()
			.mockResolvedValueOnce([receipt('a', 'processing'), receipt('b', 'needs_review')])
			.mockResolvedValueOnce([receipt('a', 'queued'), receipt('b', 'needs_review')])
			.mockResolvedValue([receipt('a', 'needs_review'), receipt('b', 'failed')]);
		const onSettled = vi.fn();

		trackReceiptReadiness({ ids: ['a', 'b'], intervalMs: 1_000, list, onSettled });

		await vi.advanceTimersByTimeAsync(2_000);
		expect(onSettled).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1_000);
		expect(onSettled).toHaveBeenCalledExactlyOnceWith({ failed: 1, ready: 1 });

		await vi.advanceTimersByTimeAsync(10_000);
		expect(list).toHaveBeenCalledTimes(3);
	});

	it('looks only at the tracked receipts', async () => {
		const list = vi.fn().mockResolvedValue([receipt('other', 'processing'), receipt('a', 'needs_review')]);
		const onSettled = vi.fn();

		trackReceiptReadiness({ ids: ['a'], intervalMs: 1_000, list, onSettled });
		await vi.advanceTimersByTimeAsync(1_000);

		expect(onSettled).toHaveBeenCalledExactlyOnceWith({ failed: 0, ready: 1 });
	});

	it('treats a failed poll as a missed tick', async () => {
		const list = vi.fn()
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValue([receipt('a', 'needs_review')]);
		const onSettled = vi.fn();

		trackReceiptReadiness({ ids: ['a'], intervalMs: 1_000, list, onSettled });
		await vi.advanceTimersByTimeAsync(2_000);

		expect(onSettled).toHaveBeenCalledExactlyOnceWith({ failed: 0, ready: 1 });
	});

	it('stops quietly when asked, and when the deadline passes', async () => {
		const list = vi.fn().mockResolvedValue([receipt('a', 'processing')]);
		const onSettled = vi.fn();
		const stop = trackReceiptReadiness({ ids: ['a'], intervalMs: 1_000, list, onSettled, timeoutMs: 5_000 });

		await vi.advanceTimersByTimeAsync(2_000);
		stop();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(list).toHaveBeenCalledTimes(2);

		const slowList = vi.fn().mockResolvedValue([receipt('a', 'processing')]);

		trackReceiptReadiness({ ids: ['a'], intervalMs: 1_000, list: slowList, onSettled, timeoutMs: 3_000 });
		await vi.advanceTimersByTimeAsync(20_000);

		expect(slowList.mock.calls.length).toBeLessThanOrEqual(3);
		expect(onSettled).not.toHaveBeenCalled();
	});
});
