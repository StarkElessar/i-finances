import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	lt,
	sql
} from 'drizzle-orm';

import { type AppDatabase, db } from '~/server/db/client';
import type {
	NewReceiptImportRecord,
	NewReceiptOperationLinkRecord,
	NewReceiptProcessingJobRecord,
	ReceiptImportRecord,
	ReceiptOperationLinkRecord,
	ReceiptProcessingJobRecord
} from '~/server/db/schema';
import {
	receiptImports,
	receiptOperationLinks,
	receiptProcessingJobs
} from '~/server/db/schema';

export type ReceiptImportAggregateRecord = {
	import: ReceiptImportRecord;
	jobs: ReceiptProcessingJobRecord[];
	links: ReceiptOperationLinkRecord[];
};

export type LeasedReceiptJobRecord = {
	import: ReceiptImportRecord;
	job: ReceiptProcessingJobRecord;
};

export type LeaseReceiptJobInput = {
	leaseExpiresAt: Date;
	leaseTokenHash: string;
	now: Date;
	workerId: string;
};

export type CompleteReceiptJobRecordInput = {
	completedAt: Date;
	jobId: string;
	leaseTokenHash: string;
	resultJson: string;
	resultSha256: string;
};

export type FailReceiptJobRecordInput = {
	error: string;
	failedAt: Date;
	jobId: string;
	leaseTokenHash: string;
};

export type ReceiptImportRepository = {
	addOperationLink: (
		link: NewReceiptOperationLinkRecord
	) => Promise<ReceiptOperationLinkRecord>;
	completeJob: (
		input: CompleteReceiptJobRecordInput
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	create: (
		receiptImport: NewReceiptImportRecord,
		job: NewReceiptProcessingJobRecord
	) => Promise<ReceiptImportAggregateRecord>;
	failJob: (
		input: FailReceiptJobRecordInput
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	findById: (
		householdId: string,
		receiptImportId: string
	) => Promise<ReceiptImportAggregateRecord | undefined>;
	findJobById: (
		jobId: string
	) => Promise<LeasedReceiptJobRecord | undefined>;
	finishApproval: (
		householdId: string,
		receiptImportId: string,
		approvedAt: Date,
		imageDeleteAfter: Date
	) => Promise<ReceiptImportRecord | undefined>;
	heartbeatJob: (
		jobId: string,
		leaseTokenHash: string,
		heartbeatAt: Date,
		leaseExpiresAt: Date
	) => Promise<ReceiptProcessingJobRecord | undefined>;
	leaseNextJob: (
		input: LeaseReceiptJobInput
	) => Promise<LeasedReceiptJobRecord | undefined>;
	list: (householdId: string) => Promise<ReceiptImportAggregateRecord[]>;
	markApprovalStarted: (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		accountId: string,
		updatedAt: Date
	) => Promise<ReceiptImportRecord | undefined>;
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

/**
 * Creates the persistence adapter for receipt imports and processing attempts.
 */
export function createReceiptImportRepository(
	database: AppDatabase = db
): ReceiptImportRepository {
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
				.orderBy(
					desc(receiptProcessingJobs.createdAt),
					desc(receiptProcessingJobs.id)
				),
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

		return record
			? (await loadAggregates([record]))[0]
			: undefined;
	};

	const list = async (
		householdId: string
	): Promise<ReceiptImportAggregateRecord[]> => {
		const records = await database.select()
			.from(receiptImports)
			.where(eq(receiptImports.householdId, householdId))
			.orderBy(desc(receiptImports.createdAt), desc(receiptImports.id));

		return loadAggregates(records);
	};

	const create = async (
		receiptImport: NewReceiptImportRecord,
		job: NewReceiptProcessingJobRecord
	): Promise<ReceiptImportAggregateRecord> => {
		const created = database.transaction((transaction) => {
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

		return created;
	};

	const findJobById = async (
		jobId: string
	): Promise<LeasedReceiptJobRecord | undefined> => {
		const row = database.select({
			import: receiptImports,
			job: receiptProcessingJobs
		})
			.from(receiptProcessingJobs)
			.innerJoin(
				receiptImports,
				eq(receiptProcessingJobs.receiptImportId, receiptImports.id)
			)
			.where(eq(receiptProcessingJobs.id, jobId))
			.limit(1)
			.get();

		return row;
	};

	const leaseNextJob = async (
		input: LeaseReceiptJobInput
	): Promise<LeasedReceiptJobRecord | undefined> => {
		return database.transaction((transaction) => {
			const expiredJobs = transaction.select({
				receiptImportId: receiptProcessingJobs.receiptImportId
			})
				.from(receiptProcessingJobs)
				.where(and(
					eq(receiptProcessingJobs.status, 'leased'),
					lt(receiptProcessingJobs.leaseExpiresAt, input.now)
				))
				.all();

			if (expiredJobs.length > 0) {
				const expiredImportIds = expiredJobs.map(
					(job) => job.receiptImportId
				);

				transaction.update(receiptProcessingJobs)
					.set({
						leaseExpiresAt: null,
						leaseTokenHash: null,
						status: 'queued',
						updatedAt: input.now,
						workerId: null,
						version: sql`${receiptProcessingJobs.version} + 1`
					})
					.where(and(
						eq(receiptProcessingJobs.status, 'leased'),
						lt(receiptProcessingJobs.leaseExpiresAt, input.now)
					))
					.run();
				transaction.update(receiptImports)
					.set({
						status: 'queued',
						updatedAt: input.now,
						version: sql`${receiptImports.version} + 1`
					})
					.where(and(
						inArray(receiptImports.id, expiredImportIds),
						eq(receiptImports.status, 'processing')
					))
					.run();
			}

			const row = transaction.select({
				import: receiptImports,
				job: receiptProcessingJobs
			})
				.from(receiptProcessingJobs)
				.innerJoin(
					receiptImports,
					eq(receiptProcessingJobs.receiptImportId, receiptImports.id)
				)
				.where(and(
					eq(receiptProcessingJobs.status, 'queued'),
					inArray(receiptImports.status, [
						'queued',
						'revision_requested'
					])
				))
				.orderBy(
					asc(receiptProcessingJobs.createdAt),
					asc(receiptProcessingJobs.id)
				)
				.limit(1)
				.get();

			if (row === undefined) {
				return undefined;
			}

			const leasedJob = transaction.update(receiptProcessingJobs)
				.set({
					attempt: sql`${receiptProcessingJobs.attempt} + 1`,
					lastHeartbeatAt: input.now,
					leaseExpiresAt: input.leaseExpiresAt,
					leaseTokenHash: input.leaseTokenHash,
					status: 'leased',
					updatedAt: input.now,
					workerId: input.workerId,
					version: sql`${receiptProcessingJobs.version} + 1`
				})
				.where(and(
					eq(receiptProcessingJobs.id, row.job.id),
					eq(receiptProcessingJobs.status, 'queued')
				))
				.returning()
				.get() as ReceiptProcessingJobRecord | undefined;

			if (leasedJob === undefined) {
				return undefined;
			}

			const updatedImport = transaction.update(receiptImports)
				.set({
					status: 'processing',
					updatedAt: input.now,
					version: sql`${receiptImports.version} + 1`
				})
				.where(eq(receiptImports.id, row.import.id))
				.returning()
				.get();

			return {
				import: updatedImport,
				job: leasedJob
			};
		});
	};

	const heartbeatJob = async (
		jobId: string,
		leaseTokenHash: string,
		heartbeatAt: Date,
		leaseExpiresAt: Date
	): Promise<ReceiptProcessingJobRecord | undefined> => {
		return database.update(receiptProcessingJobs)
			.set({
				lastHeartbeatAt: heartbeatAt,
				leaseExpiresAt,
				updatedAt: heartbeatAt,
				version: sql`${receiptProcessingJobs.version} + 1`
			})
			.where(and(
				eq(receiptProcessingJobs.id, jobId),
				eq(receiptProcessingJobs.status, 'leased'),
				eq(receiptProcessingJobs.leaseTokenHash, leaseTokenHash),
				gt(receiptProcessingJobs.leaseExpiresAt, heartbeatAt)
			))
			.returning()
			.get();
	};

	const completeJob = async (
		input: CompleteReceiptJobRecordInput
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const receiptImportId = database.transaction((transaction) => {
			const completedJob = transaction.update(receiptProcessingJobs)
				.set({
					completedAt: input.completedAt,
					leaseExpiresAt: null,
					leaseTokenHash: null,
					resultSha256: input.resultSha256,
					status: 'completed',
					updatedAt: input.completedAt,
					version: sql`${receiptProcessingJobs.version} + 1`
				})
				.where(and(
					eq(receiptProcessingJobs.id, input.jobId),
					eq(receiptProcessingJobs.status, 'leased'),
					eq(
						receiptProcessingJobs.leaseTokenHash,
						input.leaseTokenHash
					),
					gt(
						receiptProcessingJobs.leaseExpiresAt,
						input.completedAt
					)
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

		return record
			? findById(record.import.householdId, receiptImportId)
			: undefined;
	};

	const failJob = async (
		input: FailReceiptJobRecordInput
	): Promise<ReceiptImportAggregateRecord | undefined> => {
		const receiptImportId = database.transaction((transaction) => {
			const failedJob = transaction.update(receiptProcessingJobs)
				.set({
					completedAt: input.failedAt,
					lastError: input.error,
					leaseExpiresAt: null,
					leaseTokenHash: null,
					status: 'failed',
					updatedAt: input.failedAt,
					version: sql`${receiptProcessingJobs.version} + 1`
				})
				.where(and(
					eq(receiptProcessingJobs.id, input.jobId),
					eq(receiptProcessingJobs.status, 'leased'),
					eq(
						receiptProcessingJobs.leaseTokenHash,
						input.leaseTokenHash
					)
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

		return record
			? findById(record.import.householdId, receiptImportId)
			: undefined;
	};

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

		return updated
			? findById(householdId, receiptImportId)
			: undefined;
	};

	const markApprovalStarted = async (
		householdId: string,
		receiptImportId: string,
		expectedVersion: number,
		accountId: string,
		updatedAt: Date
	): Promise<ReceiptImportRecord | undefined> => {
		return database.update(receiptImports)
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
	};

	const finishApproval = async (
		householdId: string,
		receiptImportId: string,
		approvedAt: Date,
		imageDeleteAfter: Date
	): Promise<ReceiptImportRecord | undefined> => {
		return database.update(receiptImports)
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
	};

	const restoreReviewAfterApprovalFailure = async (
		householdId: string,
		receiptImportId: string,
		message: string,
		updatedAt: Date
	): Promise<ReceiptImportRecord | undefined> => {
		return database.update(receiptImports)
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
	};

	const addOperationLink = async (
		link: NewReceiptOperationLinkRecord
	): Promise<ReceiptOperationLinkRecord> => {
		return database.insert(receiptOperationLinks)
			.values(link)
			.returning()
			.get();
	};

	return {
		addOperationLink,
		completeJob,
		create,
		failJob,
		findById,
		findJobById,
		finishApproval,
		heartbeatJob,
		leaseNextJob,
		list,
		markApprovalStarted,
		requestRevision,
		restoreReviewAfterApprovalFailure
	};
}
