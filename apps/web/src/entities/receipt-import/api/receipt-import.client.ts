import { ReceiptImportClient } from '@/features/receipt-import/api';

import type {
	ApproveReceiptInput,
	ReceiptImport,
	RequestReceiptRevisionInput
} from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new ReceiptImportClient();

export const getReceiptImports = query(
	(): Promise<ReceiptImport[]> => client.list(),
	'receipt-imports'
);

export const approveReceipt = action(
	(input: ApproveReceiptInput) => client.approve(input),
	'approve-receipt'
);

export const requestReceiptRevision = action(
	(input: RequestReceiptRevisionInput) => client.requestRevision(input),
	'request-receipt-revision'
);
