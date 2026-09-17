import { resolveCommandResult } from '@/shared/api';

import { ReceiptImportClient } from '@/features/receipt-import/api';

import type {
	ApproveReceiptInput,
	ReceiptImport,
	RequestReceiptRevisionInput,
	RetryReceiptImportInput
} from '@i-finances/contracts';
import { receiptImportCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new ReceiptImportClient();

export const getReceiptImports = query(
	(): Promise<ReceiptImport[]> => client.list(),
	'receipt-imports'
);

export const approveReceipt = action(
	(input: ApproveReceiptInput) => resolveCommandResult(
		() => client.approve(input),
		receiptImportCommandResultSchema
	),
	'approve-receipt'
);

export const requestReceiptRevision = action(
	(input: RequestReceiptRevisionInput) => resolveCommandResult(
		() => client.requestRevision(input),
		receiptImportCommandResultSchema
	),
	'request-receipt-revision'
);

export const retryReceiptImport = action(
	(input: RetryReceiptImportInput) => resolveCommandResult(
		() => client.retry(input),
		receiptImportCommandResultSchema
	),
	'retry-receipt-import'
);
