import { randomUUID } from 'node:crypto';

import type { AccountRepository } from '@/modules/account';
import type { CategoryRepository } from '@/modules/category';
import type { ContactRepository } from '@/modules/contact';
import type { HouseholdResolver } from '@/modules/household';
import type { OperationService } from '@/modules/operation';

import {
	type ApproveReceiptInput,
	approveReceiptInputSchema,
	type CreatedReceiptImport,
	type ReceiptCategorySnapshot,
	type ReceiptContactSnapshot,
	type ReceiptImport,
	type ReceiptReview,
	type ReceiptWorkerResult,
	type RequestReceiptRevisionInput,
	requestReceiptRevisionInputSchema,
	type RetryReceiptImportInput,
	retryReceiptImportInputSchema,
	type UpdateReceiptReviewInput,
	updateReceiptReviewInputSchema
} from '@i-finances/contracts';

import { sha256Hex } from './receipt-hash';
import type { ReceiptImage, ReceiptImageStorage, SaveReceiptImageInput } from './receipt-image-storage';
import {
	ReceiptImportNotFoundError,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError,
	ReceiptWorkerResultError
} from './receipt-import-errors';
import {
	parseReceiptCategoriesSnapshot,
	parseReceiptContactsSnapshot,
	parseReceiptWorkerResult,
	toReceiptImport
} from './receipt-import-mappers';
import type {
	ReceiptImportAggregateRecord,
	ReceiptImportRepository
} from './receipt-import-repository';

const DEFAULT_IMAGE_RETENTION_DAYS = 30;
const REQUESTED_PIPELINE_VERSION = 'receipt-litellm-v2';

export type CreateReceiptFromImageInput = Omit<SaveReceiptImageInput, 'receiptImportId'>;

export type ClaimedReceiptProcessingJob = {
	attempt: number;
	categories: ReceiptCategorySnapshot[];
	contacts: ReceiptContactSnapshot[];
	imageStorageKey: string;
	previousResult: ReceiptWorkerResult | null;
	processingJobId: string;
	receiptImportId: string;
	requestedPipelineVersion: string;
	reviewComment: string;
};

export type ReceiptImportServiceDependencies = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	contactRepository: ContactRepository;
	householdResolver: HouseholdResolver;
	imageStorage: ReceiptImageStorage;
	operationService: OperationService;
	receiptImportRepository: ReceiptImportRepository;
	createId?: () => string;
	imageRetentionDays?: number;
	now?: () => Date;
};

const IMAGE_DELETION_BATCH_SIZE = 100;

/** An operation created by the approval loop of the current attempt, and its link group key. */
type CreatedApprovalGroup = {
	groupKey: string;
	operationId: string;
	operationVersion: number;
};

function createCategoriesSnapshotVersion(categories: readonly ReceiptCategorySnapshot[]): string {
	return sha256Hex(JSON.stringify(categories));
}

export class ReceiptImportService {
	private readonly createId: () => string;
	private readonly imageRetentionDays: number;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: ReceiptImportServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.imageRetentionDays = dependencies.imageRetentionDays ?? DEFAULT_IMAGE_RETENTION_DAYS;
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
		const contactRecords = await this.dependencies.contactRepository.list(household.id, 'active');
		const contacts: ReceiptContactSnapshot[] = contactRecords.map((record) => ({
			id: record.id,
			name: record.name
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
					contactsSnapshotJson: JSON.stringify(contacts),
					contactsSnapshotVersion: sha256Hex(JSON.stringify(contacts)),
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
					receiptImportId,
					requestedPipelineVersion: REQUESTED_PIPELINE_VERSION,
					resultSha256: null,
					status: 'queued',
					updatedAt: timestamp,
					version: 1
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
				receiptImportId: input.id,
				requestedPipelineVersion: REQUESTED_PIPELINE_VERSION,
				resultSha256: null,
				status: 'queued',
				updatedAt: timestamp,
				version: 1
			},
			timestamp
		);

		if (updated === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		return toReceiptImport(updated);
	}

	/**
	 * Re-queues a permanently failed import for another processing attempt, without the user
	 * having to re-photograph and re-upload the same receipt.
	 */
	public async retry(
		userId: string,
		unsafeInput: RetryReceiptImportInput
	): Promise<ReceiptImport> {
		const input = retryReceiptImportInputSchema.parse(unsafeInput);
		const current = await this.requireAggregate(userId, input.id);
		const timestamp = this.now();
		const updated = await this.dependencies.receiptImportRepository.retryFailedJob(
			current.householdId,
			input.id,
			input.version,
			{
				attempt: 0,
				completedAt: null,
				createdAt: timestamp,
				id: this.createId(),
				lastError: null,
				receiptImportId: input.id,
				requestedPipelineVersion: REQUESTED_PIPELINE_VERSION,
				resultSha256: null,
				status: 'queued',
				updatedAt: timestamp,
				version: 1
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

	public async claimNextQueuedJob(): Promise<ClaimedReceiptProcessingJob | undefined> {
		const claimed = await this.dependencies.receiptImportRepository.claimNextQueuedJob(this.now());

		if (claimed === undefined) {
			return undefined;
		}

		return {
			attempt: claimed.job.attempt,
			categories: parseReceiptCategoriesSnapshot(claimed.import.categoriesSnapshotJson),
			contacts: parseReceiptContactsSnapshot(claimed.import.contactsSnapshotJson),
			imageStorageKey: claimed.import.imageStorageKey,
			previousResult: parseReceiptWorkerResult(claimed.import.resultJson),
			processingJobId: claimed.job.id,
			receiptImportId: claimed.import.id,
			requestedPipelineVersion: claimed.job.requestedPipelineVersion,
			reviewComment: claimed.import.reviewComment
		};
	}

	public async recoverStaleProcessingJobs(): Promise<number> {
		return this.dependencies.receiptImportRepository.resetStaleProcessingJobs(this.now());
	}

	public async deleteExpiredImages(): Promise<{ deletedCount: number }> {
		const pending = await this.dependencies.receiptImportRepository
			.findImagesPendingDeletion(this.now(), IMAGE_DELETION_BATCH_SIZE);

		let deletedCount = 0;

		for (const record of pending) {
			try {
				await this.dependencies.imageStorage.delete(record.imageStorageKey);
				await this.dependencies.receiptImportRepository.markImageDeleted(record.id, this.now());
				deletedCount += 1;
			}
			catch (error: unknown) {
				console.error(`Failed to delete receipt image for import ${record.id}.`, error);
			}
		}

		return { deletedCount };
	}

	public async completeJob(jobId: string, result: ReceiptWorkerResult): Promise<ReceiptImport> {
		const serializedResult = JSON.stringify(result);
		const resultSha256 = sha256Hex(serializedResult);
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

		if (current === undefined || current.job.status !== 'leased') {
			throw new ReceiptImportNotFoundError();
		}

		const allowedCategoryIds = new Set(
			parseReceiptCategoriesSnapshot(current.import.categoriesSnapshotJson).map((category) => category.id)
		);
		const invalidCategory = result.categorizedItems.find((item) => (
			item.categoryId !== null && !allowedCategoryIds.has(item.categoryId)
		));

		if (invalidCategory !== undefined) {
			throw new ReceiptWorkerResultError('Результат содержит категорию, которой не было в задании.');
		}

		const allowedContactIds = new Set(
			parseReceiptContactsSnapshot(current.import.contactsSnapshotJson).map((contact) => contact.id)
		);

		if (result.receipt.contactId !== null && !allowedContactIds.has(result.receipt.contactId)) {
			throw new ReceiptWorkerResultError('Результат содержит контакт, которого не было в задании.');
		}

		const completed = await this.dependencies.receiptImportRepository.completeJob({
			completedAt: this.now(),
			jobId,
			resultJson: serializedResult,
			resultSha256
		});

		if (completed === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(completed);
	}

	public async failJob(jobId: string, error: string): Promise<ReceiptImport> {
		const failed = await this.dependencies.receiptImportRepository.failJob({
			error: error.slice(0, 2_000),
			failedAt: this.now(),
			jobId
		});

		if (failed === undefined) {
			throw new ReceiptImportNotFoundError();
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
		const contacts = parseReceiptContactsSnapshot(current.aggregate.import.contactsSnapshotJson);

		this.assertApproveOperations(input, result, categories, contacts);

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
		const createdGroups: CreatedApprovalGroup[] = [];

		try {
			for (const operationInput of input.operations) {
				// Derived from the covered item indexes, not the array position: a retried approval
				// after a partial failure regroups items freely, and a positional key would make a
				// different operation look like one that was already created.
				const groupKey = [...operationInput.itemIndexes].sort((a, b) => a - b).join('-');

				if (linkedGroupKeys.has(groupKey)) {
					continue;
				}

				const itemNames = operationInput.itemIndexes.map(
					(itemIndex) => result.receipt.items[itemIndex].name
				);
				const operation = await this.dependencies.operationService.create(userId, {
					accountId: input.accountId,
					amountMinor: operationInput.amountMinor,
					categoryId: operationInput.categoryId,
					comment: itemNames.join(', ').slice(0, 1_000),
					contactId: input.contactId,
					happenedOn: result.receipt.happenedOn,
					title: operationInput.title,
					type: 'expense'
				});

				// Recorded before the link is written: if `addOperationLink` is what throws, the
				// operation still exists and still has to be reversed.
				createdGroups.push({
					groupKey,
					operationId: operation.id,
					operationVersion: operation.version
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
			// Reverse this attempt before handing the receipt back for review. Otherwise a
			// resubmission with a different grouping derives different group keys, never
			// recognizes the orphaned operations, and silently doubles them in the ledger.
			// If the reversal itself fails we let that error out with the receipt still in
			// `approving`: a stuck receipt is recoverable, a silent duplicate is not.
			await this.reverseCreatedGroups(userId, input.id, createdGroups);

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

	/**
	 * Undoes every operation the current approval attempt created: its link is deleted and the
	 * operation itself is archived, so the receipt is back to exactly the state it had before the
	 * attempt and any resubmission — same grouping or a different one — starts clean.
	 */
	private async reverseCreatedGroups(
		userId: string,
		receiptImportId: string,
		createdGroups: readonly CreatedApprovalGroup[]
	): Promise<void> {
		if (createdGroups.length === 0) {
			return;
		}

		await this.dependencies.receiptImportRepository.deleteOperationLinks(
			receiptImportId,
			createdGroups.map((group) => group.groupKey)
		);

		for (const group of createdGroups) {
			await this.dependencies.operationService.archive(userId, {
				id: group.operationId,
				version: group.operationVersion
			});
		}
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

	private assertApproveOperations(
		input: ApproveReceiptInput,
		result: ReceiptWorkerResult,
		categories: readonly ReceiptCategorySnapshot[],
		contacts: readonly ReceiptContactSnapshot[]
	): void {
		const allowedCategoryIds = new Set(categories.map((category) => category.id));
		const allowedContactIds = new Set(contacts.map((contact) => contact.id));

		if (input.contactId !== null && !allowedContactIds.has(input.contactId)) {
			throw new ReceiptImportStateError('Выбранный контакт недоступен для этого чека.');
		}

		const seenItemIndexes = new Set<number>();
		let totalMinor = 0;

		for (const operation of input.operations) {
			if (operation.categoryId !== null && !allowedCategoryIds.has(operation.categoryId)) {
				throw new ReceiptImportStateError('Указана категория, которой не было в задании.');
			}

			// Zero-priced promo lines are allowed inside a group, but never as a standalone
			// operation: the ledger requires `amountMinor > 0`, and letting one through would only
			// blow up mid-approval, after earlier operations were already created.
			if (operation.amountMinor <= 0) {
				throw new ReceiptImportStateError('Строку с нулевой ценой нужно объединить с оплаченной позицией.');
			}

			for (const itemIndex of operation.itemIndexes) {
				if (itemIndex >= result.receipt.items.length) {
					throw new ReceiptImportStateError('Операция ссылается на отсутствующую строку чека.');
				}

				if (seenItemIndexes.has(itemIndex)) {
					throw new ReceiptImportStateError('Строка чека не может входить в две операции.');
				}

				seenItemIndexes.add(itemIndex);
			}

			totalMinor += operation.amountMinor;
		}

		if (seenItemIndexes.size !== result.receipt.items.length) {
			throw new ReceiptImportStateError('Каждая строка чека должна попасть ровно в одну операцию.');
		}

		if (totalMinor !== result.receipt.totalAmountMinor) {
			throw new ReceiptImportStateError('Сумма операций не совпадает с итогом чека.');
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
