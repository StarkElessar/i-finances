import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { households } from './households';
import { users } from './users';

import type { ReceiptImportStatus } from '~/entities/receipt-import/model/types';

/**
 * Stores the user-facing receipt draft from upload through approval.
 */
export const receiptImports = sqliteTable(
    'receipt_imports',
    {
        id: text('id').primaryKey(),
        householdId: text('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        accountId: text('account_id')
            .references(() => accounts.id, { onDelete: 'set null' }),
        status: text('status').$type<ReceiptImportStatus>().notNull(),
        imageStorageKey: text('image_storage_key').notNull(),
        imageOriginalName: text('image_original_name').notNull(),
        imageContentType: text('image_content_type').notNull(),
        imageSizeBytes: integer('image_size_bytes').notNull(),
        imageSha256: text('image_sha256').notNull(),
        imageDeleteAfter: integer('image_delete_after', { mode: 'timestamp_ms' }),
        imageDeletedAt: integer('image_deleted_at', { mode: 'timestamp_ms' }),
        categoriesSnapshotJson: text('categories_snapshot_json').notNull(),
        categoriesSnapshotVersion: text('categories_snapshot_version').notNull(),
        resultJson: text('result_json'),
        reviewComment: text('review_comment').notNull().default(''),
        createdByUserId: text('created_by_user_id')
            .notNull()
            .references(() => users.id),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
        approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
        version: integer('version').notNull().default(1)
    },
    (table) => [
        check(
            'receipt_imports_status_check',
            sql`${table.status} IN (
				'queued',
				'processing',
				'needs_review',
				'revision_requested',
				'approving',
				'approved',
				'failed',
				'cancelled'
			)`
        ),
        check(
            'receipt_imports_image_size_positive_check',
            sql`${table.imageSizeBytes} > 0`
        ),
        index('receipt_imports_household_created_idx').on(
            table.householdId,
            table.createdAt
        ),
        index('receipt_imports_household_status_idx').on(
            table.householdId,
            table.status
        ),
        uniqueIndex('receipt_imports_image_storage_key_unique').on(
            table.imageStorageKey
        )
    ]
);

export type ReceiptImportRecord = typeof receiptImports.$inferSelect;
export type NewReceiptImportRecord = typeof receiptImports.$inferInsert;
