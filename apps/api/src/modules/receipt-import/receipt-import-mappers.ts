import {
	receiptCategorySnapshotSchema,
	type ReceiptImport,
	type ReceiptProcessingJob,
	receiptWorkerResultSchema
} from '@i-finances/contracts';
import { z } from 'zod';

import type { ReceiptImportAggregateRecord } from './receipt-import-repository';

const categoriesSnapshotSchema = z.array(receiptCategorySnapshotSchema);

export function parseReceiptCategoriesSnapshot(value: string) {
	return categoriesSnapshotSchema.parse(JSON.parse(value));
}

export function parseReceiptWorkerResult(value: string | null) {
	return value === null ? null : receiptWorkerResultSchema.parse(JSON.parse(value));
}

function toProcessingJob(record: ReceiptImportAggregateRecord['jobs'][number]): ReceiptProcessingJob {
	return {
		attempt: record.attempt,
		completedAt: record.completedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
		id: record.id,
		lastError: record.lastError,
		status: record.status,
		updatedAt: record.updatedAt.toISOString(),
		workerId: record.workerId
	};
}

export function toReceiptImport(record: ReceiptImportAggregateRecord): ReceiptImport {
	const latestJob = record.jobs[0];

	return {
		accountId: record.import.accountId,
		approvedAt: record.import.approvedAt?.toISOString() ?? null,
		categories: parseReceiptCategoriesSnapshot(record.import.categoriesSnapshotJson),
		categoriesSnapshotVersion: record.import.categoriesSnapshotVersion,
		createdAt: record.import.createdAt.toISOString(),
		id: record.import.id,
		imageContentType: record.import.imageContentType,
		imageDeletedAt: record.import.imageDeletedAt?.toISOString() ?? null,
		imageOriginalName: record.import.imageOriginalName,
		imageSizeBytes: record.import.imageSizeBytes,
		imageUrl: record.import.imageDeletedAt === null
			? `/api/receipt-imports/${encodeURIComponent(record.import.id)}/image`
			: null,
		latestJob: toProcessingJob(latestJob),
		operationIds: record.links.map((link) => link.operationId),
		result: parseReceiptWorkerResult(record.import.resultJson),
		reviewComment: record.import.reviewComment,
		status: record.import.status,
		updatedAt: record.import.updatedAt.toISOString(),
		version: record.import.version
	};
}
