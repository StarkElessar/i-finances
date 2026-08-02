import {
	createHash,
	randomBytes,
	randomUUID
} from 'node:crypto';

import type {
	ApproveReceiptInput,
	CompleteReceiptJobInput,
	FailReceiptJobInput,
	RequestReceiptRevisionInput
} from '~/entities/receipt-import/api/receipt-import.contract';
import {
	approveReceiptInputSchema,
	completeReceiptJobInputSchema,
	failReceiptJobInputSchema,
	requestReceiptRevisionInputSchema
} from '~/entities/receipt-import/api/receipt-import.contract';
import type {
	CreatedReceiptImport,
	LeasedReceiptProcessingJob,
	ReceiptCategorySnapshot,
	ReceiptImport,
	ReceiptWorkerResult
} from '~/entities/receipt-import/model/types';

import type { AccountRepository } from '~/server/account/account-repository';
import type { CategoryRepository } from '~/server/category/category-repository';
import type { HouseholdResolver } from '~/server/household/household-service';
import type { OperationService } from '~/server/operation/operation-service';
import type {
	ReceiptImageStorage,
	SaveReceiptImageInput
} from '~/server/receipt-import/receipt-image-storage';
import {
	ReceiptImportNotFoundError,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError,
	ReceiptJobLeaseError,
	ReceiptWorkerResultError
} from '~/server/receipt-import/receipt-import-errors';
import {
	parseReceiptCategoriesSnapshot,
	parseReceiptWorkerResult,
	toReceiptImport
} from '~/server/receipt-import/receipt-import-mappers';
import type {
	ReceiptImportAggregateRecord,
	ReceiptImportRepository
} from '~/server/receipt-import/receipt-import-repository';

const DEFAULT_LEASE_MILLISECONDS = 10 * 60 * 1_000;
const DEFAULT_IMAGE_RETENTION_DAYS = 30;
const REQUESTED_PIPELINE_VERSION = 'receipt-local-v1';

export type CreateReceiptFromImageInput = Omit<
	SaveReceiptImageInput,
	'receiptImportId'
>;

export type ReceiptImage = {
	bytes: Uint8Array;
	contentSha256: string;
	contentType: string;
	originalName: string;
	sizeBytes: number;
};

export type ReceiptImportService = {
	approve: (
		userId: string,
		input: ApproveReceiptInput
	) => Promise<ReceiptImport>;
	completeJob: (
		jobId: string,
		unsafeInput: CompleteReceiptJobInput
	) => Promise<ReceiptImport>;
	createFromImage: (
		userId: string,
		input: CreateReceiptFromImageInput
	) => Promise<CreatedReceiptImport>;
	failJob: (
		jobId: string,
		unsafeInput: FailReceiptJobInput
	) => Promise<ReceiptImport>;
	heartbeatJob: (
		jobId: string,
		leaseToken: string
	) => Promise<string>;
	leaseNextJob: (
		workerId: string
	) => Promise<LeasedReceiptProcessingJob | undefined>;
	list: (userId: string) => Promise<ReceiptImport[]>;
	readImageForUser: (
		userId: string,
		receiptImportId: string
	) => Promise<ReceiptImage>;
	readImageForWorker: (
		jobId: string,
		leaseToken: string
	) => Promise<ReceiptImage>;
	requestRevision: (
		userId: string,
		input: RequestReceiptRevisionInput
	) => Promise<ReceiptImport>;
};

export type ReceiptImportServiceDependencies = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	householdResolver: HouseholdResolver;
	imageStorage: ReceiptImageStorage;
	operationService: OperationService;
	receiptImportRepository: ReceiptImportRepository;
	createId?: () => string;
	imageRetentionDays?: number;
	leaseMilliseconds?: number;
	now?: () => Date;
};

function hashValue(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function createCategoriesSnapshotVersion(
	categories: readonly ReceiptCategorySnapshot[]
): string {
	return hashValue(JSON.stringify(categories));
}

function getCategoryName(
	categories: readonly ReceiptCategorySnapshot[],
	categoryId: string | null
): string {
	if (categoryId === null) {
		return 'Без категории';
	}

	return categories.find((category) => category.id === categoryId)?.name
		?? 'Без категории';
}

function createOperationGroups(
	result: ReceiptWorkerResult,
	categories: readonly ReceiptCategorySnapshot[]
) {
	const categoryByItem = new Map(
		result.categorizedItems.map((item) => [item.itemIndex, item.categoryId])
	);
	const groups = new Map<string, {
		amountMinor: number;
		categoryId: string | null;
		categoryName: string;
		itemNames: string[];
	}>();

	result.receipt.items.forEach((item, itemIndex) => {
		const categoryId = categoryByItem.get(itemIndex) ?? null;
		const groupKey = categoryId ?? 'uncategorized';
		const group = groups.get(groupKey) ?? {
			amountMinor: 0,
			categoryId,
			categoryName: getCategoryName(categories, categoryId),
			itemNames: []
		};

		group.amountMinor += item.totalMinor;
		group.itemNames.push(item.name);
		groups.set(groupKey, group);
	});

	return [...groups.entries()].filter(([, group]) => group.amountMinor > 0);
}

/**
 * Creates receipt import workflows around storage, worker delivery and review.
 */
export function createReceiptImportService(
	dependencies: ReceiptImportServiceDependencies
): ReceiptImportService {
	const createId = dependencies.createId ?? randomUUID;
	const imageRetentionDays = dependencies.imageRetentionDays
		?? DEFAULT_IMAGE_RETENTION_DAYS;
	const leaseMilliseconds = dependencies.leaseMilliseconds
		?? DEFAULT_LEASE_MILLISECONDS;
	const now = dependencies.now ?? (() => new Date());

	const requireAggregate = async (
		userId: string,
		receiptImportId: string
	): Promise<{
		aggregate: ReceiptImportAggregateRecord;
		householdId: string;
	}> => {
		const household = await dependencies.householdResolver.requireForUser(
			userId
		);
		const aggregate = await dependencies.receiptImportRepository.findById(
			household.id,
			receiptImportId
		);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return {
			aggregate,
			householdId: household.id
		};
	};

	const list = async (userId: string): Promise<ReceiptImport[]> => {
		const household = await dependencies.householdResolver.requireForUser(
			userId
		);
		const records = await dependencies.receiptImportRepository.list(
			household.id
		);

		return records.map(toReceiptImport);
	};

	const createFromImage = async (
		userId: string,
		input: CreateReceiptFromImageInput
	): Promise<CreatedReceiptImport> => {
		const household = await dependencies.householdResolver.requireForUser(
			userId
		);
		const categoryRecords = await dependencies.categoryRepository.list(
			household.id,
			'active'
		);
		const categories: ReceiptCategorySnapshot[] = categoryRecords.map(
			(record) => ({
				description: record.category.description,
				id: record.category.id,
				keywords: record.keywords.map((keyword) => keyword.value),
				name: record.category.name
			})
		);
		const receiptImportId = createId();
		const processingJobId = createId();
		const timestamp = now();
		const storedImage = await dependencies.imageStorage.save({
			...input,
			receiptImportId
		});

		try {
			await dependencies.receiptImportRepository.create(
				{
					accountId: null,
					approvedAt: null,
					categoriesSnapshotJson: JSON.stringify(categories),
					categoriesSnapshotVersion:
						createCategoriesSnapshotVersion(categories),
					createdAt: timestamp,
					createdByUserId: userId,
					householdId: household.id,
					id: receiptImportId,
					imageContentType: storedImage.contentType,
					imageDeleteAfter: null,
					imageDeletedAt: null,
					imageOriginalName: storedImage.originalName,
					imageSha256: storedImage.contentSha256,
					imageSizeBytes: storedImage.sizeBytes,
					imageStorageKey: storedImage.storageKey,
					resultJson: null,
					reviewComment: '',
					status: 'queued',
					updatedAt: timestamp,
					version: 1
				},
				{
					attempt: 0,
					completedAt: null,
					createdAt: timestamp,
					id: processingJobId,
					lastError: null,
					lastHeartbeatAt: null,
					leaseExpiresAt: null,
					leaseTokenHash: null,
					receiptImportId,
					requestedPipelineVersion: REQUESTED_PIPELINE_VERSION,
					resultSha256: null,
					status: 'queued',
					updatedAt: timestamp,
					version: 1,
					workerId: null
				}
			);
		}
		catch (error: unknown) {
			await dependencies.imageStorage.delete(storedImage.storageKey);
			throw error;
		}

		return {
			id: receiptImportId,
			status: 'queued'
		};
	};

	const requestRevision = async (
		userId: string,
		unsafeInput: RequestReceiptRevisionInput
	): Promise<ReceiptImport> => {
		const input = requestReceiptRevisionInputSchema.parse(unsafeInput);
		const current = await requireAggregate(userId, input.id);
		const timestamp = now();
		const updated = await dependencies.receiptImportRepository
			.requestRevision(
				current.householdId,
				input.id,
				input.version,
				input.comment,
				{
					attempt: 0,
					completedAt: null,
					createdAt: timestamp,
					id: createId(),
					lastError: null,
					lastHeartbeatAt: null,
					leaseExpiresAt: null,
					leaseTokenHash: null,
					receiptImportId: input.id,
					requestedPipelineVersion: REQUESTED_PIPELINE_VERSION,
					resultSha256: null,
					status: 'queued',
					updatedAt: timestamp,
					version: 1,
					workerId: null
				},
				timestamp
			);

		if (updated === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		return toReceiptImport(updated);
	};

	const leaseNextJob = async (
		workerId: string
	): Promise<LeasedReceiptProcessingJob | undefined> => {
		const timestamp = now();
		const leaseExpiresAt = new Date(
			timestamp.getTime() + leaseMilliseconds
		);
		const leaseToken = randomBytes(32).toString('base64url');
		const leased = await dependencies.receiptImportRepository.leaseNextJob({
			leaseExpiresAt,
			leaseTokenHash: hashValue(leaseToken),
			now: timestamp,
			workerId
		});

		if (leased === undefined) {
			return undefined;
		}

		return {
			attempt: leased.job.attempt,
			categories: parseReceiptCategoriesSnapshot(
				leased.import.categoriesSnapshotJson
			),
			categoriesSnapshotVersion:
				leased.import.categoriesSnapshotVersion,
			imageUrl: `/api/receipt-worker/jobs/${leased.job.id}/image`,
			leaseExpiresAt: leaseExpiresAt.toISOString(),
			leaseToken,
			previousResult: parseReceiptWorkerResult(
				leased.import.resultJson
			),
			processingJobId: leased.job.id,
			receiptImportId: leased.import.id,
			requestedPipelineVersion: leased.job.requestedPipelineVersion,
			reviewComment: leased.import.reviewComment,
			schemaVersion: 1
		};
	};

	const requireActiveLease = async (
		jobId: string,
		leaseToken: string
	) => {
		const record = await dependencies.receiptImportRepository.findJobById(
			jobId
		);

		if (
			record === undefined
			|| record.job.status !== 'leased'
			|| record.job.leaseTokenHash !== hashValue(leaseToken)
			|| record.job.leaseExpiresAt === null
			|| record.job.leaseExpiresAt <= now()
		) {
			throw new ReceiptJobLeaseError();
		}

		return record;
	};

	const readStoredImage = async (
		aggregate: ReceiptImportAggregateRecord
	): Promise<ReceiptImage> => {
		if (aggregate.import.imageDeletedAt !== null) {
			throw new ReceiptImportStateError('Фотография чека уже удалена.');
		}

		return {
			bytes: await dependencies.imageStorage.read(
				aggregate.import.imageStorageKey
			),
			contentSha256: aggregate.import.imageSha256,
			contentType: aggregate.import.imageContentType,
			originalName: aggregate.import.imageOriginalName,
			sizeBytes: aggregate.import.imageSizeBytes
		};
	};

	const readImageForUser = async (
		userId: string,
		receiptImportId: string
	): Promise<ReceiptImage> => {
		const current = await requireAggregate(userId, receiptImportId);

		return readStoredImage(current.aggregate);
	};

	const readImageForWorker = async (
		jobId: string,
		leaseToken: string
	): Promise<ReceiptImage> => {
		const record = await requireActiveLease(jobId, leaseToken);

		return readStoredImage({
			import: record.import,
			jobs: [record.job],
			links: []
		});
	};

	const heartbeatJob = async (
		jobId: string,
		leaseToken: string
	): Promise<string> => {
		const timestamp = now();
		const leaseExpiresAt = new Date(
			timestamp.getTime() + leaseMilliseconds
		);
		const job = await dependencies.receiptImportRepository.heartbeatJob(
			jobId,
			hashValue(leaseToken),
			timestamp,
			leaseExpiresAt
		);

		if (job === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return leaseExpiresAt.toISOString();
	};

	const completeJob = async (
		jobId: string,
		unsafeInput: CompleteReceiptJobInput
	): Promise<ReceiptImport> => {
		const input = completeReceiptJobInputSchema.parse(unsafeInput);
		const serializedResult = JSON.stringify(input.result);
		const resultSha256 = hashValue(serializedResult);
		const current = await dependencies.receiptImportRepository.findJobById(
			jobId
		);

		if (
			current?.job.status === 'completed'
			&& current.job.resultSha256 === resultSha256
		) {
			const aggregate = await dependencies.receiptImportRepository
				.findById(current.import.householdId, current.import.id);

			if (aggregate !== undefined) {
				return toReceiptImport(aggregate);
			}
		}

		const active = await requireActiveLease(jobId, input.leaseToken);

		if (input.result.processor.workerId !== active.job.workerId) {
			throw new ReceiptWorkerResultError(
				'workerId результата не совпадает с worker-ом задания.'
			);
		}

		const allowedCategoryIds = new Set(
			parseReceiptCategoriesSnapshot(
				active.import.categoriesSnapshotJson
			).map((category) => category.id)
		);
		const invalidCategory = input.result.categorizedItems.find(
			(item) => (
				item.categoryId !== null
				&& !allowedCategoryIds.has(item.categoryId)
			)
		);

		if (invalidCategory !== undefined) {
			throw new ReceiptWorkerResultError(
				'Результат содержит категорию, которой не было в задании.'
			);
		}

		const completed = await dependencies.receiptImportRepository.completeJob({
			completedAt: now(),
			jobId,
			leaseTokenHash: hashValue(input.leaseToken),
			resultJson: serializedResult,
			resultSha256
		});

		if (completed === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return toReceiptImport(completed);
	};

	const failJob = async (
		jobId: string,
		unsafeInput: FailReceiptJobInput
	): Promise<ReceiptImport> => {
		const input = failReceiptJobInputSchema.parse(unsafeInput);

		await requireActiveLease(jobId, input.leaseToken);

		const failed = await dependencies.receiptImportRepository.failJob({
			error: input.error,
			failedAt: now(),
			jobId,
			leaseTokenHash: hashValue(input.leaseToken)
		});

		if (failed === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return toReceiptImport(failed);
	};

	const approve = async (
		userId: string,
		unsafeInput: ApproveReceiptInput
	): Promise<ReceiptImport> => {
		const input = approveReceiptInputSchema.parse(unsafeInput);
		const current = await requireAggregate(userId, input.id);
		const result = parseReceiptWorkerResult(
			current.aggregate.import.resultJson
		);

		if (
			current.aggregate.import.status !== 'needs_review'
			|| result === null
		) {
			throw new ReceiptImportStateError(
				'Чек ещё не готов к подтверждению.'
			);
		}

		const account = await dependencies.accountRepository.findById(
			current.householdId,
			input.accountId
		);

		if (account === undefined || account.archivedAt !== null) {
			throw new ReceiptImportStateError('Выбранный счёт недоступен.');
		}

		if (account.currency !== result.receipt.currency) {
			throw new ReceiptImportStateError(
				'В первой версии валюта счёта должна совпадать с валютой чека.'
			);
		}

		const groups = createOperationGroups(
			result,
			parseReceiptCategoriesSnapshot(
				current.aggregate.import.categoriesSnapshotJson
			)
		);
		const groupedTotalMinor = groups.reduce(
			(total, [, group]) => total + group.amountMinor,
			0
		);

		if (groupedTotalMinor !== result.receipt.totalAmountMinor) {
			throw new ReceiptImportStateError(
				'Сумма товарных строк не совпадает с итогом чека.'
			);
		}

		const approvalStarted = await dependencies.receiptImportRepository
			.markApprovalStarted(
				current.householdId,
				input.id,
				input.version,
				input.accountId,
				now()
			);

		if (approvalStarted === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const linkedGroupKeys = new Set(
			current.aggregate.links.map((link) => link.groupKey)
		);

		try {
			for (const [groupKey, group] of groups) {
				if (linkedGroupKeys.has(groupKey)) {
					continue;
				}

				const merchantName = result.receipt.merchant.displayName
					?? result.receipt.merchant.legalName
					?? 'Покупка по чеку';
				const operation = await dependencies.operationService.create(
					userId,
					{
						accountId: input.accountId,
						amountMinor: group.amountMinor,
						categoryId: group.categoryId,
						comment: group.itemNames.join(', ').slice(0, 1_000),
						contactId: null,
						happenedOn: result.receipt.happenedOn,
						title: `${merchantName} · ${group.categoryName}`
							.slice(0, 160),
						type: 'expense'
					}
				);

				await dependencies.receiptImportRepository.addOperationLink({
					createdAt: now(),
					groupKey,
					operationId: operation.id,
					receiptImportId: input.id
				});
			}
		}
		catch (error: unknown) {
			await dependencies.receiptImportRepository
				.restoreReviewAfterApprovalFailure(
					current.householdId,
					input.id,
					'Не все операции удалось создать. Повторите подтверждение.',
					now()
				);
			throw error;
		}

		const approvedAt = now();
		const imageDeleteAfter = new Date(
			approvedAt.getTime()
			+ imageRetentionDays * 24 * 60 * 60 * 1_000
		);
		const approved = await dependencies.receiptImportRepository
			.finishApproval(
				current.householdId,
				input.id,
				approvedAt,
				imageDeleteAfter
			);

		if (approved === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const aggregate = await dependencies.receiptImportRepository.findById(
			current.householdId,
			input.id
		);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(aggregate);
	};

	return {
		approve,
		completeJob,
		createFromImage,
		failJob,
		heartbeatJob,
		leaseNextJob,
		list,
		readImageForUser,
		readImageForWorker,
		requestRevision
	};
}
