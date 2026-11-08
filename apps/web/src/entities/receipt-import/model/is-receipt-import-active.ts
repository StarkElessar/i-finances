import type { ReceiptImportStatus } from './types';

const ACTIVE_RECEIPT_IMPORT_STATUSES: ReadonlySet<ReceiptImportStatus> = new Set([
	'approving',
	'processing',
	'queued',
	'revision_requested'
]);

/** The worker still owns the receipt: its status will change on its own, so a screen should keep polling. */
export function isReceiptImportActive(status: ReceiptImportStatus): boolean {
	return ACTIVE_RECEIPT_IMPORT_STATUSES.has(status);
}
