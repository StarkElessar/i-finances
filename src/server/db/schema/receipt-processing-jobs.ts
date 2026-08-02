import type { ReceiptProcessingJobStatus } from '~/entities/receipt-import/model/types';

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	sqliteTable,
	text
} from 'drizzle-orm/sqlite-core';

import { receiptImports } from './receipt-imports';

/**
 * Stores one delivery and processing attempt for a receipt import.
 */
export const receiptProcessingJobs = sqliteTable(
	'receipt_processing_jobs',
	{
		id: text('id').primaryKey(),
		receiptImportId: text('receipt_import_id')
			.notNull()
			.references(() => receiptImports.id, { onDelete: 'cascade' }),
		status: text('status').$type<ReceiptProcessingJobStatus>().notNull(),
		attempt: integer('attempt').notNull().default(0),
		requestedPipelineVersion: text('requested_pipeline_version').notNull(),
		workerId: text('worker_id'),
		leaseTokenHash: text('lease_token_hash'),
		leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
		lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp_ms' }),
		resultSha256: text('result_sha256'),
		lastError: text('last_error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		check(
			'receipt_processing_jobs_status_check',
			sql`${table.status} IN (
				'queued',
				'leased',
				'completed',
				'failed',
				'cancelled'
			)`
		),
		check(
			'receipt_processing_jobs_attempt_nonnegative_check',
			sql`${table.attempt} >= 0`
		),
		index('receipt_processing_jobs_receipt_created_idx').on(
			table.receiptImportId,
			table.createdAt
		),
		index('receipt_processing_jobs_status_created_idx').on(
			table.status,
			table.createdAt
		)
	]
);

export type ReceiptProcessingJobRecord =
	typeof receiptProcessingJobs.$inferSelect;
export type NewReceiptProcessingJobRecord =
	typeof receiptProcessingJobs.$inferInsert;
