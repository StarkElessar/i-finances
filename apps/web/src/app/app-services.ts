import type { AccountClient } from '@/features/accounts';
import type { AuthClient } from '@/features/auth';
import type { CategoryClient } from '@/features/categories';
import type { ContactClient } from '@/features/contacts';
import type { OperationClient } from '@/features/operations';
import type { ReceiptImportClient } from '@/features/receipt-import';

export type AppServices = {
	accountClient: AccountClient;
	authClient: AuthClient;
	categoryClient: CategoryClient;
	contactClient: ContactClient;
	operationClient: OperationClient;
	receiptImportClient: ReceiptImportClient;
};
