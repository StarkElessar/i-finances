/**
 * Storage-level literal types used by the Drizzle schema.
 *
 * These are intentionally local while application/domain types are migrated.
 * They describe persisted values and do not expose database rows as API
 * contracts.
 */
export type AccountTypeValue = 'card' | 'cash' | 'other' | 'savings';

export type ContactType = 'company' | 'person' | 'unknown';

export type CurrencyCodeValue = 'BYN' | 'EUR' | 'USD';

export type OperationType = 'expense' | 'income';

export type ReceiptImportStatus =
	| 'approved'
	| 'approving'
	| 'cancelled'
	| 'failed'
	| 'needs_review'
	| 'processing'
	| 'queued'
	| 'revision_requested';

export type ReceiptProcessingJobStatus =
	| 'cancelled'
	| 'completed'
	| 'failed'
	| 'leased'
	| 'queued';
