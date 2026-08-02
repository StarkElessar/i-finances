import { getAccounts } from '~/entities/account/api';
import { getReceiptImports } from '~/entities/receipt-import';

import { ReceiptsPage } from '~/views/receipts/page';

import type { RouteDefinition } from '@solidjs/router';

export const route = {
	preload: () => Promise.all([
		getReceiptImports(),
		getAccounts(false)
	])
} satisfies RouteDefinition;

export default function Receipts() {
	return <ReceiptsPage/>;
}
