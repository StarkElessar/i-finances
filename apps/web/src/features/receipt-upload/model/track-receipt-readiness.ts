import type { ReceiptImportStatus } from '@/entities/receipt-import';
import { isReceiptImportActive } from '@/entities/receipt-import';

export type TrackedReceipt = {
	id: string;
	status: ReceiptImportStatus;
};

export type ReceiptReadiness = {
	/** Waiting for the owner's review. */
	ready: number;
	/** The worker gave up. */
	failed: number;
};

export type TrackReceiptReadinessOptions = {
	ids: readonly string[];
	list: () => Promise<readonly TrackedReceipt[]>;
	onSettled: (readiness: ReceiptReadiness) => void;
	intervalMs?: number;
	/** Stop watching quietly after this long; the receipts page still shows the statuses. */
	timeoutMs?: number;
};

const DEFAULT_INTERVAL_MS = 2_500;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;

/**
 * Polls until none of the given receipts is still being processed, then reports once how many are ready and how
 * many failed. Receipts that were approved, cancelled or removed in the meantime count for neither. A failed poll
 * is only a missed tick. Returns the function that stops the watch.
 */
export function trackReceiptReadiness(options: TrackReceiptReadinessOptions): () => void {
	const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
	const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const tracked = new Set(options.ids);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const stop = (): void => {
		stopped = true;
		clearTimeout(timer);
	};

	const schedule = (): void => {
		if (!stopped) {
			timer = setTimeout(() => void tick(), intervalMs);
		}
	};

	const tick = async (): Promise<void> => {
		if (Date.now() >= deadline) {
			stop();
			return;
		}

		let receipts: readonly TrackedReceipt[];

		try {
			receipts = (await options.list()).filter((receipt) => tracked.has(receipt.id));
		}
		catch {
			schedule();
			return;
		}

		if (stopped) {
			return;
		}

		if (receipts.some((receipt) => isReceiptImportActive(receipt.status))) {
			schedule();
			return;
		}

		stop();
		options.onSettled({
			failed: receipts.filter((receipt) => receipt.status === 'failed').length,
			ready: receipts.filter((receipt) => receipt.status === 'needs_review').length
		});
	};

	schedule();

	return stop;
}
