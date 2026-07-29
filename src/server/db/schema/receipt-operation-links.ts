import {
    index,
    integer,
    primaryKey,
    sqliteTable,
    text
} from 'drizzle-orm/sqlite-core';

import { operations } from './operations';
import { receiptImports } from './receipt-imports';

/**
 * Links every category group from an approved receipt to its ledger operation.
 */
export const receiptOperationLinks = sqliteTable(
    'receipt_operation_links',
    {
        receiptImportId: text('receipt_import_id')
            .notNull()
            .references(() => receiptImports.id, { onDelete: 'cascade' }),
        groupKey: text('group_key').notNull(),
        operationId: text('operation_id')
            .notNull()
            .references(() => operations.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        primaryKey({
            columns: [table.receiptImportId, table.groupKey]
        }),
        index('receipt_operation_links_operation_idx').on(table.operationId)
    ]
);

export type ReceiptOperationLinkRecord =
	typeof receiptOperationLinks.$inferSelect;
export type NewReceiptOperationLinkRecord =
	typeof receiptOperationLinks.$inferInsert;
