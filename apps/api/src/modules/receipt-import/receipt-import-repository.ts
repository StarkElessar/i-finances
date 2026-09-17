import type { AppDatabase } from '@/infrastructure/database/client';
import type {
	NewReceiptImportRecord,
	NewReceiptOperationLinkRecord,
	NewReceiptProcessingJobRecord,
	ReceiptImportRecord,
	ReceiptOperationLinkRecord,
	ReceiptProcessingJobRecord
} from '@/infrastructure/database/schema';
import {
	receiptImports,
	receiptOperationLinks,
	receiptProcessingJobs
} from '@/infrastructure/database/schema';

import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNull,
	lte,
	sql
} from 'drizzle-orm';

export type ReceiptImportAggregateRecord = {
	import: ReceiptImportRecord;
	jobs: ReceiptProcessingJobRecord[];
	links: ReceiptOperationLinkRecord[];
};

export type ReceiptJobRecord = {
	import: ReceiptImportRecord;
	job: ReceiptProcessingJobRecord;
};

export type ClaimedReceiptJobRecord = ReceiptJobRecord;

export type CompleteReceiptJobRecordInput = {
	completedAt: Date;
	jobId: string;
	resultJson: string;
	resultSha256: string;
};

export type FailReceiptJobRecordInput = {
	error: string;
	failedAt: Date;
	jobId: string;
};

export type ReceiptImportRepository = {
	addOperationLink: (link: NewReceiptOperationLinkRecord) => Promise<ReceiptOperationLinkRecord>;
	completeJob: (input: CompleteReceiptJobRecordInput) => Promise<ReceiptImportAggregateRecord | undefined>;
	create: (
		receiptImport: NewReceiptImportRecord,
		job: NewReceiptProcessingJobRecord
	) => Promise<ReceiptImportAggregateRecord>;
	deleteOperationLinks: (
		receiptImportId: string,
		groupKeys: readonly string[]
	) => Promise<ReceiptOperationLinkRecord[]>;
	failJob: (input: FailReceiptJobRecordInput) => Promise<ReceiptImportAggregateRecord | undefined>;
	findById: (
		householdId: string,
		receiptImportId: string
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	findImagesPendingDeletion: (now: Date, limit: number) => Promise<ReceiptImportRecord[]>;
	findJobById: (jobId: string) => Promise<ReceiptJobRecord | undefined>;
	finishApproval: (
		householdId: string,
		receiptImportId: string,
		approvedAt: Date,
		imageDeleteAfter: Date
	) => Promise<ReceiptImportRecord | undefined>;
	claimNextQueuedJob: (now: Date) => Promise<ClaimedReceiptJobRecord | undefined>;
	resetStaleProcessingJobs: (now: Date) => Promise<number>;
	list: (householdId: string) => Promise<ReceiptImportAggregateRecord[]>;
	markApprovalStarted: (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		accountId: string,
		updatedAt: Date
	) => Promise<ReceiptImportRecord | undefined>;
	markImageDeleted: (
		receiptImportId: string,
		deletedAt: Date
	) => Promise<ReceiptImportRecord | undefined>;
	updateReview: (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		resultJson: string,
		updatedAt: Date
	) => Promise<ReceiptImportRecord | undefined>;
	retryFailedJob: (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		job: NewReceiptProcessingJobRecord,
		updatedAt: Date
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	requestRevision: (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		comment: string,
		job: NewReceiptProcessingJobRecord,
		updatedAt: Date
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	restoreReviewAfterApprovalFailure: (
		householdId: string,
		receiptImportId: string,
		message: string,
		updatedAt: Date
	) => Promise<ReceiptImportRecord | undefined>;
};

export function createReceiptImportRepository(database: AppDatabase): ReceiptImportRepository {
	const loadAggregates = async (
		importRecords: ReceiptImportRecord[]
	): Promise<ReceiptImportAggregateRecord[]> => {
		if (importRecords.length === 0) {
			return [];
		}

		const importIds = importRecords.map((record) => record.id);
		const [jobRecords, linkRecords] = await Promise.all([
			database.select()
				.from(receiptProcessingJobs)
				.where(inArray(receiptProcessingJobs.receiptImportId, importIds))
				.orderBy(desc(receiptProcessingJobs.createdAt), desc(receiptProcessingJobs.id)),
			database.select()
				.from(receiptOperationLinks)
				.where(inArray(receiptOperationLinks.receiptImportId, importIds))
				.orderBy(asc(receiptOperationLinks.groupKey))
		]);
		const jobsByImport = new Map<string, ReceiptProcessingJobRecord[]>();
		const linksByImport = new Map<string, ReceiptOperationLinkRecord[]>();

		jobRecords.forEach((job) => {
			const jobs = jobsByImport.get(job.receiptImportId) ?? [];

			jobs.push(job);
			jobsByImport.set(job.receiptImportId, jobs);
		});
		linkRecords.forEach((link) => {
			const links = linksByImport.get(link.receiptImportId) ?? [];

			links.push(link);
			linksByImport.set(link.receiptImportId, links);
		});

		return importRecords.map((receiptImport) => ({
			import: receiptImport,
			jobs: jobsByImport.get(receiptImport.id) ?? [],
			links: linksByImport.get(receiptImport.id) ?? []
		}));
	};

	const findById = async (
		householdId: string,
		receiptImportId: string
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const record = database.select()
			.from(receiptImports)
			.where(and(
				eq(receiptImports.householdId, householdId),
				eq(receiptImports.id, receiptImportId)
			))
			.limit(1)
			.get();

		return record === undefined ? undefined : (await loadAggregates([record]))[0];
	};

	const findImagesPendingDeletion = async (
		now: Date,
		limit: number
	): Promise<ReceiptImportRecord[]> => database.select()
		.from(receiptImports)
		.where(and(
			eq(receiptImports.status, 'approved'),
			lte(receiptImports.imageDeleteAfter, now),
			isNull(receiptImports.imageDeletedAt)
		))
		.orderBy(asc(receiptImports.imageDeleteAfter))
		.limit(limit)
		.all();

	const markImageDeleted = async (
		receiptImportId: string,
		deletedAt: Date
	): Promise<ReceiptImportRecord | undefined> => database.update(receiptImports)
		.set({
			imageDeletedAt: deletedAt,
			updatedAt: deletedAt,
			version: sql`${receiptImports.version} + 1`
		})
		.where(and(
			eq(receiptImports.id, receiptImportId),
			isNull(receiptImports.imageDeletedAt)
		))
		.returning()
		.get();

	const list = async (householdId: string): Promise<ReceiptImportAggregateRecord[]> => {
		const records = await database.select()
			.from(receiptImports)
			.where(eq(receiptImports.householdId, householdId))
			.orderBy(desc(receiptImports.createdAt), desc(receiptImports.id));

		return loadAggregates(records);
	};

	const create = async (
		receiptImport: NewReceiptImportRecord,
		job: NewReceiptProcessingJobRecord
	): Promise<ReceiptImportAggregateRecord> => database.transaction((transaction) => {
		const createdImport = transaction.insert(receiptImports)
			.values(receiptImport)
			.returning()
			.get();
		const createdJob = transaction.insert(receiptProcessingJobs)
			.values(job)
			.returning()
			.get();

		return {
			import: createdImport,
			jobs: [createdJob],
			links: []
		};
	});

	const findJobById = async (jobId: string): Promise<ReceiptJobRecord | undefined> => database.select({
		import: receiptImports,
		job: receiptProcessingJobs
	})
		.from(receiptProcessingJobs)
		.innerJoin(receiptImports, eq(receiptProcessingJobs.receiptImportId, receiptImports.id))
		.where(eq(receiptProcessingJobs.id, jobId))
		.limit(1)
		.get();

	const claimNextQueuedJob = async (
		now: Date
	): Promise<ClaimedReceiptJobRecord | undefined> => database.transaction((transaction) => {
		const row = transaction.select({
			import: receiptImports,
			job: receiptProcessingJobs
		})
			.from(receiptProcessingJobs)
			.innerJoin(receiptImports, eq(receiptProcessingJobs.receiptImportId, receiptImports.id))
			.where(and(
				eq(receiptProcessingJobs.status, 'queued'),
				inArray(receiptImports.status, ['queued', 'revision_requested'])
			))
			.orderBy(asc(receiptProcessingJobs.createdAt), asc(receiptProcessingJobs.id))
			.limit(1)
			.get();

		if (row === undefined) {
			return undefined;
		}

		const claimedJob = transaction.update(receiptProcessingJobs)
			.set({
				attempt: sql`${receiptProcessingJobs.attempt} + 1`,
				status: 'leased',
				updatedAt: now,
				version: sql`${receiptProcessingJobs.version} + 1`
			})
			.where(and(
				eq(receiptProcessingJobs.id, row.job.id),
				eq(receiptProcessingJobs.status, 'queued')
			))
			.returning()
			.get() as ReceiptProcessingJobRecord | undefined;

		if (claimedJob === undefined) {
			return undefined;
		}

		const updatedImport = transaction.update(receiptImports)
			.set({
				status: 'processing',
				updatedAt: now,
				version: sql`${receiptImports.version} + 1`
			})
			.where(eq(receiptImports.id, row.import.id))
			.returning()
			.get();

		return { import: updatedImport, job: claimedJob };
	});

	const completeJob = async (
		input: CompleteReceiptJobRecordInput
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const receiptImportId = database.transaction((transaction) => {
			const completedJob = transaction.update(receiptProcessingJobs)
				.set({
					completedAt: input.completedAt,
					resultSha256: input.resultSha256,
					status: 'completed',
					updatedAt: input.completedAt,
					version: sql`${receiptProcessingJobs.version} + 1`
				})
				.where(and(
					eq(receiptProcessingJobs.id, input.jobId),
					eq(receiptProcessingJobs.status, 'leased')
				))
				.returning()
				.get() as ReceiptProcessingJobRecord | undefined;

			if (completedJob === undefined) {
				return undefined;
			}

			transaction.update(receiptImports)
				.set({
					resultJson: input.resultJson,
					status: 'needs_review',
					updatedAt: input.completedAt,
					version: sql`${receiptImports.version} + 1`
				})
				.where(and(
					eq(receiptImports.id, completedJob.receiptImportId),
					eq(receiptImports.status, 'processing')
				))
				.run();

			return completedJob.receiptImportId;
		});

		if (receiptImportId === undefined) {
			return undefined;
		}

		const record = await findJobById(input.jobId);

		return record === undefined
			? undefined
			: findById(record.import.householdId, receiptImportId);
	};

	const failJob = async (
		input: FailReceiptJobRecordInput
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const receiptImportId = database.transaction((transaction) => {
			const failedJob = transaction.update(receiptProcessingJobs)
				.set({
					completedAt: input.failedAt,
					lastError: input.error,
					status: 'failed',
					updatedAt: input.failedAt,
					version: sql`${receiptProcessingJobs.version} + 1`
				})
				.where(and(
					eq(receiptProcessingJobs.id, input.jobId),
					eq(receiptProcessingJobs.status, 'leased')
				))
				.returning()
				.get() as ReceiptProcessingJobRecord | undefined;

			if (failedJob === undefined) {
				return undefined;
			}

			transaction.update(receiptImports)
				.set({
					status: 'failed',
					updatedAt: input.failedAt,
					version: sql`${receiptImports.version} + 1`
				})
				.where(eq(receiptImports.id, failedJob.receiptImportId))
				.run();

			return failedJob.receiptImportId;
		});

		if (receiptImportId === undefined) {
			return undefined;
		}

		const record = await findJobById(input.jobId);

		return record === undefined
			? undefined
			: findById(record.import.householdId, receiptImportId);
	};

	const resetStaleProcessingJobs = async (now: Date): Promise<number> => database.transaction((transaction) => {
		const staleJobs = transaction.select({
			id: receiptProcessingJobs.id,
			receiptImportId: receiptProcessingJobs.receiptImportId
		})
			.from(receiptProcessingJobs)
			.where(eq(receiptProcessingJobs.status, 'leased'))
			.all();

		if (staleJobs.length === 0) {
			return 0;
		}

		const staleImportIds = staleJobs.map((job) => job.receiptImportId);

		transaction.update(receiptProcessingJobs)
			.set({ status: 'queued', updatedAt: now, version: sql`${receiptProcessingJobs.version} + 1` })
			.where(eq(receiptProcessingJobs.status, 'leased'))
			.run();

		transaction.update(receiptImports)
			.set({ status: 'queued', updatedAt: now, version: sql`${receiptImports.version} + 1` })
			.where(and(
				inArray(receiptImports.id, staleImportIds),
				eq(receiptImports.status, 'processing')
			))
			.run();

		return staleJobs.length;
	});

	const requestRevision = async (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		comment: string,
		job: NewReceiptProcessingJobRecord,
		updatedAt: Date
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const updated = database.transaction((transaction) => {
			const updatedImport = transaction.update(receiptImports)
				.set({
					reviewComment: comment,
					status: 'revision_requested',
					updatedAt,
					version: sql`${receiptImports.version} + 1`
				})
				.where(and(
					eq(receiptImports.householdId, householdId),
					eq(receiptImports.id, receiptImportId),
					eq(receiptImports.status, 'needs_review'),
					eq(receiptImports.version, expectedVersion)
				))
				.returning()
				.get() as ReceiptImportRecord | undefined;

			if (updatedImport === undefined) {
				return false;
			}

			transaction.insert(receiptProcessingJobs).values(job).run();

			return true;
		});

		return updated ? findById(householdId, receiptImportId) : undefined;
	};

	const retryFailedJob = async (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		job: NewReceiptProcessingJobRecord,
		updatedAt: Date
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const updated = database.transaction((transaction) => {
			const updatedImport = transaction.update(receiptImports)
				.set({
					status: 'queued',
					updatedAt,
					version: sql`${receiptImports.version} + 1`
				})
				.where(and(
					eq(receiptImports.householdId, householdId),
					eq(receiptImports.id, receiptImportId),
					eq(receiptImports.status, 'failed'),
					eq(receiptImports.version, expectedVersion)
				))
				.returning()
				.get() as ReceiptImportRecord | undefined;

			if (updatedImport === undefined) {
				return false;
			}

			transaction.insert(receiptProcessingJobs).values(job).run();

			return true;
		});

		return updated ? findById(householdId, receiptImportId) : undefined;
	};

	const markApprovalStarted = async (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		accountId: string,
		updatedAt: Date
	): Promise<ReceiptImportRecord | undefined> => database.update(receiptImports)
		.set({
			accountId,
			status: 'approving',
			updatedAt,
			version: sql`${receiptImports.version} + 1`
		})
		.where(and(
			eq(receiptImports.householdId, householdId),
			eq(receiptImports.id, receiptImportId),
			eq(receiptImports.status, 'needs_review'),
			eq(receiptImports.version, expectedVersion)
		))
		.returning()
		.get();

	const finishApproval = async (
		householdId: string,
		receiptImportId: string,
		approvedAt: Date,
		imageDeleteAfter: Date
	): Promise<ReceiptImportRecord | undefined> => database.update(receiptImports)
		.set({
			approvedAt,
			imageDeleteAfter,
			status: 'approved',
			updatedAt: approvedAt,
			version: sql`${receiptImports.version} + 1`
		})
		.where(and(
			eq(receiptImports.householdId, householdId),
			eq(receiptImports.id, receiptImportId),
			eq(receiptImports.status, 'approving')
		))
		.returning()
		.get();

	const updateReview = async (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		resultJson: string,
		updatedAt: Date
	): Promise<ReceiptImportRecord | undefined> => database.update(receiptImports)
		.set({
			resultJson,
			updatedAt,
			version: sql`${receiptImports.version} + 1`
		})
		.where(and(
			eq(receiptImports.householdId, householdId),
			eq(receiptImports.id, receiptImportId),
			eq(receiptImports.status, 'needs_review'),
			eq(receiptImports.version, expectedVersion)
		))
		.returning()
		.get();

	const restoreReviewAfterApprovalFailure = async (
		householdId: string,
		receiptImportId: string,
		message: string,
		updatedAt: Date
	): Promise<ReceiptImportRecord | undefined> => database.update(receiptImports)
		.set({
			reviewComment: message,
			status: 'needs_review',
			updatedAt,
			version: sql`${receiptImports.version} + 1`
		})
		.where(and(
			eq(receiptImports.householdId, householdId),
			eq(receiptImports.id, receiptImportId),
			eq(receiptImports.status, 'approving')
		))
		.returning()
		.get();

	const addOperationLink = async (
		link: NewReceiptOperationLinkRecord
	): Promise<ReceiptOperationLinkRecord> => database.insert(receiptOperationLinks)
		.values(link)
		.onConflictDoNothing()
		.returning()
		.get();

	/**
	 * Removes the links a failed approval attempt left behind. Returns the deleted rows so the
	 * caller can tell which operations were actually linked and reverse them too.
	 */
	const deleteOperationLinks = async (
		receiptImportId: string,
		groupKeys: readonly string[]
	): Promise<ReceiptOperationLinkRecord[]> => {
		if (groupKeys.length === 0) {
			return [];
		}

		return database.delete(receiptOperationLinks)
			.where(and(
				eq(receiptOperationLinks.receiptImportId, receiptImportId),
				inArray(receiptOperationLinks.groupKey, [...groupKeys])
			))
			.returning()
			.all();
	};

	return {
		addOperationLink,
		completeJob,
		create,
		deleteOperationLinks,
		failJob,
		findById,
		findImagesPendingDeletion,
		findJobById,
		finishApproval,
		claimNextQueuedJob,
		resetStaleProcessingJobs,
		list,
		markApprovalStarted,
		markImageDeleted,
		requestRevision,
		restoreReviewAfterApprovalFailure,
		retryFailedJob,
		updateReview
	};
}
