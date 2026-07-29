import type { RouteDefinition } from '@solidjs/router';

import { getAccounts } from '~/entities/account/api';
import { getReceiptImports } from '~/entities/receipt-import';
import { ReceiptsPage } from '~/views/receipts/page';

export const route = {
    preload: () => Promise.all([
        getReceiptImports(),
        getAccounts(false)
    ])
} satisfies RouteDefinition;

export default function Receipts() {
    return <ReceiptsPage/>;
}
