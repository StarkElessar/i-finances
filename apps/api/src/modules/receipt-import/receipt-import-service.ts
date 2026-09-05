import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { AccountRepository } from '@/modules/account';
import type { CategoryRepository } from '@/modules/category';
import type { HouseholdResolver } from '@/modules/household';
import type { OperationService } from '@/modules/operation';

import {
	type ApproveReceiptInput,
	approveReceiptInputSchema,
	type CompleteReceiptJobInput,
	completeReceiptJobInputSchema,
	type CreatedReceiptImport,
	type FailReceiptJobInput,
	failReceiptJobInputSchema,
	type LeasedReceiptProcessingJob,
	type ReceiptCategorySnapshot,
	type ReceiptImport,
	type ReceiptReview,
	type ReceiptWorkerResult,
	type RequestReceiptRevisionInput,
	requestReceiptRevisionInputSchema,
	type UpdateReceiptReviewInput,
	updateReceiptReviewInputSchema
} from '@i-finances/contracts';

import type { ReceiptImage, ReceiptImageStorage, SaveReceiptImageInput } from './receipt-image-storage';
import {
	ReceiptImportNotFoundError,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError,
	ReceiptJobLeaseError,
	ReceiptWorkerResultError
} from './receipt-import-errors';
import {
	parseReceiptCategoriesSnapshot,
	parseReceiptWorkerResult,
	toReceiptImport
} from './receipt-import-mappers';
import type {
	ReceiptImportAggregateRecord,
	ReceiptImportRepository
} from './receipt-import-repository';

const DEFAULT_LEASE_MILLISECONDS = 10 * 60 * 1_000;
const DEFAULT_IMAGE_RETENTION_DAYS = 30;
const REQUESTED_PIPELINE_VERSION = 'receipt-local-v1';

export type CreateReceiptFromImageInput = Omit<SaveReceiptImageInput, 'receiptImportId'>;

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

function createCategoriesSnapshotVersion(categories: readonly ReceiptCategorySnapshot[]): string {
	return hashValue(JSON.stringify(categories));
}

function getCategoryName(categories: readonly ReceiptCategorySnapshot[], categoryId: string | null): string {
	if (categoryId === null) {
		return 'Без категории';
	}

	return categories.find((category) => category.id === categoryId)?.name ?? 'Без категории';
}

function createOperationGroups(
	result: ReceiptWorkerResult,
	categories: readonly ReceiptCategorySnapshot[]
) {
	const categoryByItem = new Map(result.categorizedItems.map((item) => [item.itemIndex, item.categoryId]));
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

export class ReceiptImportService {
	private readonly createId: () => string;
	private readonly imageRetentionDays: number;
	private readonly leaseMilliseconds: number;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: ReceiptImportServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.imageRetentionDays = dependencies.imageRetentionDays ?? DEFAULT_IMAGE_RETENTION_DAYS;
		this.leaseMilliseconds = dependencies.leaseMilliseconds ?? DEFAULT_LEASE_MILLISECONDS;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async list(userId: string): Promise<ReceiptImport[]> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const records = await this.dependencies.receiptImportRepository.list(household.id);

		return records.map(toReceiptImport);
	}

	public async createFromImage(
		userId: string,
		input: CreateReceiptFromImageInput
	): Promise<CreatedReceiptImport> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const categoryRecords = await this.dependencies.categoryRepository.list(household.id, 'active');
		const categories: ReceiptCategorySnapshot[] = categoryRecords.map((record) => ({
			description: record.category.description,
			id: record.category.id,
			keywords: record.keywords.map((keyword) => keyword.value),
			name: record.category.name
		}));
		const receiptImportId = this.createId();
		const timestamp = this.now();
		const storedImage = await this.dependencies.imageStorage.save({
			...input,
			receiptImportId
		});

		try {
			await this.dependencies.receiptImportRepository.create(
				{
					accountId: null,
					approvedAt: null,
					categoriesSnapshotJson: JSON.stringify(categories),
					categoriesSnapshotVersion: createCategoriesSnapshotVersion(categories),
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
					id: this.createId(),
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
			await this.dependencies.imageStorage.delete(storedImage.storageKey);
			throw error;
		}

		return { id: receiptImportId, status: 'queued' };
	}

	public async requestRevision(
		userId: string,
		unsafeInput: RequestReceiptRevisionInput
	): Promise<ReceiptImport> {
		const input = requestReceiptRevisionInputSchema.parse(unsafeInput);
		const current = await this.requireAggregate(userId, input.id);
		const timestamp = this.now();
		const updated = await this.dependencies.receiptImportRepository.requestRevision(
			current.householdId,
			input.id,
			input.version,
			input.comment,
			{
				attempt: 0,
				completedAt: null,
				createdAt: timestamp,
				id: this.createId(),
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
	}

	public async updateReview(
		userId: string,
		unsafeInput: UpdateReceiptReviewInput
	): Promise<ReceiptImport> {
		const input = updateReceiptReviewInputSchema.parse(unsafeInput);
		const current = await this.requireAggregate(userId, input.id);
		const currentResult = parseReceiptWorkerResult(current.aggregate.import.resultJson);

		if (current.aggregate.import.status !== 'needs_review' || currentResult === null) {
			throw new ReceiptImportStateError('Чек ещё не готов к редактированию.');
		}

		this.assertReviewCategories(current.aggregate, input.review);

		const updatedResult: ReceiptWorkerResult = {
			...currentResult,
			categorizedItems: input.review.categorizedItems,
			receipt: {
				...currentResult.receipt,
				happenedOn: input.review.happenedOn,
				items: input.review.items,
				merchant: input.review.merchant,
				totalAmountMinor: input.review.totalAmountMinor
			}
		};
		const updated = await this.dependencies.receiptImportRepository.updateReview(
			current.householdId,
			input.id,
			input.version,
			JSON.stringify(updatedResult),
			this.now()
		);

		if (updated === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const aggregate = await this.dependencies.receiptImportRepository.findById(current.householdId, input.id);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(aggregate);
	}

	public async leaseNextJob(workerId: string): Promise<LeasedReceiptProcessingJob | undefined> {
		const timestamp = this.now();
		const leaseExpiresAt = new Date(timestamp.getTime() + this.leaseMilliseconds);
		const leaseToken = randomBytes(32).toString('base64url');
		const leased = await this.dependencies.receiptImportRepository.leaseNextJob({
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
			categories: parseReceiptCategoriesSnapshot(leased.import.categoriesSnapshotJson),
			categoriesSnapshotVersion: leased.import.categoriesSnapshotVersion,
			imageUrl: `/api/receipt-worker/jobs/${encodeURIComponent(leased.job.id)}/image`,
			leaseExpiresAt: leaseExpiresAt.toISOString(),
			leaseToken,
			previousResult: parseReceiptWorkerResult(leased.import.resultJson),
			processingJobId: leased.job.id,
			receiptImportId: leased.import.id,
			requestedPipelineVersion: leased.job.requestedPipelineVersion,
			reviewComment: leased.import.reviewComment,
			schemaVersion: 1
		};
	}

	public async heartbeatJob(jobId: string, leaseToken: string): Promise<string> {
		const timestamp = this.now();
		const leaseExpiresAt = new Date(timestamp.getTime() + this.leaseMilliseconds);
		const job = await this.dependencies.receiptImportRepository.heartbeatJob(
			jobId,
			hashValue(leaseToken),
			timestamp,
			leaseExpiresAt
		);

		if (job === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return leaseExpiresAt.toISOString();
	}

	public async completeJob(
		jobId: string,
		unsafeInput: CompleteReceiptJobInput
	): Promise<ReceiptImport> {
		const input = completeReceiptJobInputSchema.parse(unsafeInput);
		const serializedResult = JSON.stringify(input.result);
		const resultSha256 = hashValue(serializedResult);
		const current = await this.dependencies.receiptImportRepository.findJobById(jobId);

		if (current?.job.status === 'completed' && current.job.resultSha256 === resultSha256) {
			const aggregate = await this.dependencies.receiptImportRepository.findById(
				current.import.householdId,
				current.import.id
			);

			if (aggregate !== undefined) {
				return toReceiptImport(aggregate);
			}
		}

		const active = await this.requireActiveLease(jobId, input.leaseToken);

		if (input.result.processor.workerId !== active.job.workerId) {
			throw new ReceiptWorkerResultError('workerId результата не совпадает с worker-ом задания.');
		}

		const allowedCategoryIds = new Set(
			parseReceiptCategoriesSnapshot(active.import.categoriesSnapshotJson).map((category) => category.id)
		);
		const invalidCategory = input.result.categorizedItems.find((item) => (
			item.categoryId !== null && !allowedCategoryIds.has(item.categoryId)
		));

		if (invalidCategory !== undefined) {
			throw new ReceiptWorkerResultError('Результат содержит категорию, которой не было в задании.');
		}

		const completed = await this.dependencies.receiptImportRepository.completeJob({
			completedAt: this.now(),
			jobId,
			leaseTokenHash: hashValue(input.leaseToken),
			resultJson: serializedResult,
			resultSha256
		});

		if (completed === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return toReceiptImport(completed);
	}

	public async failJob(jobId: string, unsafeInput: FailReceiptJobInput): Promise<ReceiptImport> {
		const input = failReceiptJobInputSchema.parse(unsafeInput);

		await this.requireActiveLease(jobId, input.leaseToken);
		const failed = await this.dependencies.receiptImportRepository.failJob({
			error: input.error,
			failedAt: this.now(),
			jobId,
			leaseTokenHash: hashValue(input.leaseToken)
		});

		if (failed === undefined) {
			throw new ReceiptJobLeaseError();
		}

		return toReceiptImport(failed);
	}

	public async approve(userId: string, unsafeInput: ApproveReceiptInput): Promise<ReceiptImport> {
		const input = approveReceiptInputSchema.parse(unsafeInput);
		const current = await this.requireAggregate(userId, input.id);
		const result = parseReceiptWorkerResult(current.aggregate.import.resultJson);

		if (current.aggregate.import.status !== 'needs_review' || result === null) {
			throw new ReceiptImportStateError('Чек ещё не готов к подтверждению.');
		}

		const account = await this.dependencies.accountRepository.findById(current.householdId, input.accountId);

		if (account === undefined || account.archivedAt !== null) {
			throw new ReceiptImportStateError('Выбранный счёт недоступен.');
		}

		if (account.currency !== result.receipt.currency) {
			throw new ReceiptImportStateError('В первой версии валюта счёта должна совпадать с валютой чека.');
		}

		const categories = parseReceiptCategoriesSnapshot(current.aggregate.import.categoriesSnapshotJson);
		const groups = createOperationGroups(result, categories);
		const groupedTotalMinor = groups.reduce((total, [, group]) => total + group.amountMinor, 0);

		if (groupedTotalMinor !== result.receipt.totalAmountMinor) {
			throw new ReceiptImportStateError('Сумма товарных строк не совпадает с итогом чека.');
		}

		const approvalStarted = await this.dependencies.receiptImportRepository.markApprovalStarted(
			current.householdId,
			input.id,
			input.version,
			input.accountId,
			this.now()
		);

		if (approvalStarted === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const linkedGroupKeys = new Set(current.aggregate.links.map((link) => link.groupKey));

		try {
			for (const [groupKey, group] of groups) {
				if (linkedGroupKeys.has(groupKey)) {
					continue;
				}

				const merchantName = result.receipt.merchant.displayName
					?? result.receipt.merchant.legalName
					?? 'Покупка по чеку';
				const operation = await this.dependencies.operationService.create(userId, {
					accountId: input.accountId,
					amountMinor: group.amountMinor,
					categoryId: group.categoryId,
					comment: group.itemNames.join(', ').slice(0, 1_000),
					contactId: null,
					happenedOn: result.receipt.happenedOn,
					title: `${merchantName} · ${group.categoryName}`.slice(0, 160),
					type: 'expense'
				});

				await this.dependencies.receiptImportRepository.addOperationLink({
					createdAt: this.now(),
					groupKey,
					operationId: operation.id,
					receiptImportId: input.id
				});
			}
		}
		catch (error: unknown) {
			await this.dependencies.receiptImportRepository.restoreReviewAfterApprovalFailure(
				current.householdId,
				input.id,
				'Не все операции удалось создать. Повторите подтверждение.',
				this.now()
			);
			throw error;
		}

		const approvedAt = this.now();
		const approved = await this.dependencies.receiptImportRepository.finishApproval(
			current.householdId,
			input.id,
			approvedAt,
			new Date(approvedAt.getTime() + this.imageRetentionDays * 24 * 60 * 60 * 1_000)
		);

		if (approved === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const aggregate = await this.dependencies.receiptImportRepository.findById(current.householdId, input.id);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(aggregate);
	}

	public async readImageForUser(userId: string, receiptImportId: string): Promise<ReceiptImage> {
		const current = await this.requireAggregate(userId, receiptImportId);

		return this.readStoredImage(current.aggregate);
	}

	public async readImageForWorker(jobId: string, leaseToken: string): Promise<ReceiptImage> {
		const record = await this.requireActiveLease(jobId, leaseToken);

		return this.readStoredImage({ import: record.import, jobs: [record.job], links: [] });
	}

	private async requireAggregate(userId: string, receiptImportId: string): Promise<{
		aggregate: ReceiptImportAggregateRecord;
		householdId: string;
	}> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const aggregate = await this.dependencies.receiptImportRepository.findById(household.id, receiptImportId);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return { aggregate, householdId: household.id };
	}

	private async requireActiveLease(jobId: string, leaseToken: string) {
		const record = await this.dependencies.receiptImportRepository.findJobById(jobId);

		if (
			record === undefined
			|| record.job.status !== 'leased'
			|| record.job.leaseTokenHash !== hashValue(leaseToken)
			|| record.job.leaseExpiresAt === null
			|| record.job.leaseExpiresAt <= this.now()
		) {
			throw new ReceiptJobLeaseError();
		}

		return record;
	}

	private assertReviewCategories(
		aggregate: ReceiptImportAggregateRecord,
		review: ReceiptReview
	): void {
		const allowedCategoryIds = new Set(
			parseReceiptCategoriesSnapshot(aggregate.import.categoriesSnapshotJson).map((category) => category.id)
		);
		const invalidCategory = review.categorizedItems.find((item) => (
			item.categoryId !== null && !allowedCategoryIds.has(item.categoryId)
		));

		if (invalidCategory !== undefined) {
			throw new ReceiptWorkerResultError('Результат содержит категорию, которой не было в задании.');
		}
	}

	private async readStoredImage(aggregate: ReceiptImportAggregateRecord): Promise<ReceiptImage> {
		if (aggregate.import.imageDeletedAt !== null) {
			throw new ReceiptImportStateError('Фотография чека уже удалена.');
		}

		return {
			bytes: await this.dependencies.imageStorage.read(aggregate.import.imageStorageKey),
			contentSha256: aggregate.import.imageSha256,
			contentType: aggregate.import.imageContentType,
			originalName: aggregate.import.imageOriginalName,
			sizeBytes: aggregate.import.imageSizeBytes
		};
	}
}
