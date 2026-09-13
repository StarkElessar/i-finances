import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { accounts, categories, contacts, householdMembers, households, users } from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';
import {
	createReceiptImageStorage,
	createReceiptImportRepository,
	ReceiptImportService,
	ReceiptImportStateError,
	ReceiptWorkerResultError
} from '@/modules/receipt-import';

import { receiptWorkerResultSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-receipt';
const HOUSEHOLD_ID = 'household-receipt';
const FIXED_DATE = new Date('2026-08-08T10:00:00.000Z');
// Uploads are decoded and re-encoded to JPEG on save (receipt-image-storage.ts),
// so tests need a genuinely valid image rather than placeholder bytes.
const sampleImageBytes = new Uint8Array(await sharp({
	create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 8, width: 8 }
}).jpeg().toBuffer());

let connection: Database.Database;
let database: AppDatabase;
let imageRoot: string;
let currentDate: Date;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	imageRoot = await mkdtemp(join(tmpdir(), 'i-finances-receipts-'));
	currentDate = FIXED_DATE;

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Receipt User',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'receipt-user'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Receipt Household',
		updatedAt: FIXED_DATE
	});
	await database.insert(householdMembers).values({
		householdId: HOUSEHOLD_ID,
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
	await database.insert(accounts).values({
		archivedAt: null,
		color: '#3f77a8',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		currency: 'BYN',
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'account-receipt',
		initialBalanceMinor: 0,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: 'Основной счёт',
		type: 'card',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(accounts).values({
		archivedAt: null,
		color: '#a87f3f',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		currency: 'USD',
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'account-usd',
		initialBalanceMinor: 0,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: 'Валютный счёт',
		type: 'card',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(categories).values({
		archivedAt: null,
		color: '#68a063',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'category-food',
		monthlyBudgetMinor: null,
		name: 'Продукты',
		normalizedName: 'продукты',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(contacts).values({
		archivedAt: null,
		color: '#a06368',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		householdId: HOUSEHOLD_ID,
		id: 'contact-shop',
		legalName: null,
		name: 'Магазин',
		normalizedLegalName: null,
		normalizedName: 'магазин',
		phone: null,
		type: 'company',
		updatedAt: FIXED_DATE,
		version: 1
	});
});

afterEach(async () => {
	connection.close();
	await rm(imageRoot, { force: true, recursive: true });
});

function createOperationService(): OperationService {
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => currentDate);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));

	return new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository: new ContactRepository(database),
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		operationRepository: new OperationRepository(database),
		now: () => currentDate
	});
}

function createService(operationService: OperationService = createOperationService()): ReceiptImportService {
	let idSequence = 0;
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => currentDate);
	const contactRepository = new ContactRepository(database);

	return new ReceiptImportService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository,
		householdResolver,
		imageStorage: createReceiptImageStorage({ rootDirectory: imageRoot }),
		operationService,
		receiptImportRepository: createReceiptImportRepository(database),
		createId: () => `receipt-${++idSequence}`,
		now: () => currentDate
	});
}

type WorkerResultItem = {
	name: string;
	totalMinor: number;
};

const DEFAULT_WORKER_RESULT_ITEMS: WorkerResultItem[] = [{ name: 'Продукты', totalMinor: 1_250 }];

function createWorkerResult(
	items: readonly WorkerResultItem[] = DEFAULT_WORKER_RESULT_ITEMS,
	contactId: string | null = 'contact-shop'
) {
	return receiptWorkerResultSchema.parse({
		categorizedItems: items.map((_, itemIndex) => ({
			categoryId: 'category-food',
			confidence: 0.99,
			itemIndex
		})),
		processor: {
			finishedAt: FIXED_DATE.toISOString(),
			modelVersions: ['deepseek-v4-flash-vision-exp', 'deepseek-v4-flash'],
			pipelineVersion: 'receipt-litellm-v1',
			startedAt: FIXED_DATE.toISOString(),
			workerId: 'api-inprocess'
		},
		rawOcrText: 'Продукты 12.50',
		receipt: {
			contactId,
			currency: 'BYN',
			happenedOn: '2026-08-08',
			items: items.map((item) => ({
				discountMinor: 0,
				name: item.name,
				quantity: 1,
				totalMinor: item.totalMinor,
				unitPriceMinor: item.totalMinor
			})),
			merchant: {
				address: null,
				displayName: 'Магазин',
				legalName: null,
				unp: null
			},
			totalAmountMinor: items.reduce((sum, item) => sum + item.totalMinor, 0)
		},
		schemaVersion: 1,
		warnings: []
	});
}

/**
 * Operations that still count in the ledger. A reversed approval archives (soft-deletes) the
 * operations it created, so the rows survive but must never be counted again.
 */
async function listLedgerOperations() {
	const rows = await database.select().from(schema.operations);

	return rows.filter((operation) => operation.deletedAt === null);
}

/** Lets the first operations through and fails the nth one, simulating a mid-loop approval crash. */
function failOperationCreateOnCall(operationService: OperationService, failingCall: number) {
	const original = operationService.create.bind(operationService);
	let callCount = 0;

	return vi.spyOn(operationService, 'create').mockImplementation(async (userId, input) => {
		callCount += 1;

		if (callCount === failingCall) {
			throw new Error('SQLITE_BUSY');
		}

		return original(userId, input);
	});
}

async function createReviewableReceipt(
	service: ReceiptImportService,
	result = createWorkerResult()
) {
	const created = await service.createFromImage(USER_ID, {
		bytes: sampleImageBytes,
		contentType: 'image/jpeg',
		originalName: 'receipt.jpg'
	});
	const claimed = await service.claimNextQueuedJob();

	if (claimed === undefined) {
		throw new Error('Expected a claimed receipt job.');
	}

	return { claimed, created, completed: await service.completeJob(claimed.processingJobId, result) };
}

describe('ReceiptImportService', () => {
	it('keeps the review boundary and creates linked operations only after approval', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: sampleImageBytes,
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		expect(created.status).toBe('queued');
		expect(claimed).toMatchObject({ receiptImportId: created.id, requestedPipelineVersion: 'receipt-litellm-v1' });

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		expect(completed.status).toBe('needs_review');
		expect(completed.operationIds).toEqual([]);

		const updatedReview = await service.updateReview(USER_ID, {
			id: created.id,
			review: {
				categorizedItems: [{ categoryId: 'category-food', confidence: null, itemIndex: 0 }],
				happenedOn: '2026-08-07',
				items: [{
					discountMinor: 0,
					name: 'Исправленные продукты',
					quantity: 1,
					totalMinor: 1_300,
					unitPriceMinor: 1_300
				}],
				merchant: {
					address: null,
					displayName: 'Исправленный магазин',
					legalName: null,
					unp: null
				},
				totalAmountMinor: 1_300
			},
			version: completed.version
		});

		expect(updatedReview.result?.receipt.happenedOn).toBe('2026-08-07');

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_300,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: updatedReview.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);

		const operations = await database.select().from(schema.operations);

		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({ amountMinor: 1_300, categoryId: 'category-food', contactId: 'contact-shop' });
	});

	it('rejects approval when the submitted operations do not cover every item exactly once', async () => {
		const service = createService();
		// Two items, one non-empty operation covering only the first: passes the schema's
		// `min(1)` so the service-level coverage guard is what actually rejects this.
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_000 },
			{ name: 'Вода', totalMinor: 250 }
		]));

		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: null,
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		})).rejects.toThrow(new ReceiptImportStateError('Каждая строка чека должна попасть ровно в одну операцию.'));
	});

	it('rejects approval when the contact is not in the stored contacts snapshot', async () => {
		const service = createService();
		const { completed, created } = await createReviewableReceipt(service);

		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-does-not-exist',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		})).rejects.toThrow(new ReceiptImportStateError('Выбранный контакт недоступен для этого чека.'));
	});

	it('rejects approval when the settlement account currency differs from the receipt currency', async () => {
		const service = createService();
		const { completed, created } = await createReviewableReceipt(service);

		await expect(service.approve(USER_ID, {
			accountId: 'account-usd',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		})).rejects.toThrow(
			new ReceiptImportStateError('В первой версии валюта счёта должна совпадать с валютой чека.')
		);
	});

	it('approves a receipt whose zero-priced promotional item is grouped with a paid one', async () => {
		const service = createService();
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_250 },
			{ name: 'Подарок по акции', totalMinor: 0 }
		]));

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0, 1],
				title: 'Продукты'
			}],
			version: completed.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);
	});

	it('rejects a standalone zero-amount operation with a clear message', async () => {
		const service = createService();
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_250 },
			{ name: 'Подарок по акции', totalMinor: 0 }
		]));

		// A zero-priced promo line may be grouped into a paid operation, but never stand alone:
		// the operation domain requires `amountMinor > 0`, and without this guard the request would
		// only blow up mid-approval, after earlier operations were already written.
		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [
				{ amountMinor: 1_250, categoryId: 'category-food', itemIndexes: [0], title: 'Продукты' },
				{ amountMinor: 0, categoryId: 'category-food', itemIndexes: [1], title: 'Подарок по акции' }
			],
			version: completed.version
		})).rejects.toThrow(
			new ReceiptImportStateError('Строку с нулевой ценой нужно объединить с оплаченной позицией.')
		);

		// Rejected before `markApprovalStarted`: no status change, no operations, no links.
		const untouched = (await service.list(USER_ID)).find((item) => item.id === created.id);

		expect(untouched?.status).toBe('needs_review');
		expect(untouched?.version).toBe(completed.version);
		expect(await database.select().from(schema.operations)).toHaveLength(0);
	});

	it('groups a zero-priced promo line into a paid operation', async () => {
		const service = createService();
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_250 },
			{ name: 'Подарок по акции', totalMinor: 0 }
		]));
		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0, 1],
				title: 'Продукты'
			}],
			version: completed.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);
	});

	it('never re-claims a job that already failed', async () => {
		const service = createService();

		await service.createFromImage(USER_ID, {
			bytes: sampleImageBytes,
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});

		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const failed = await service.failJob(claimed.processingJobId, 'LiteLLM request failed');

		expect(failed.status).toBe('failed');
		// No automatic retry: only the "request revision" user action creates a new attempt.
		expect(await service.claimNextQueuedJob()).toBeUndefined();
	});

	it('rejects a model result whose contact is not in the stored contacts snapshot', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: sampleImageBytes,
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		expect(created.status).toBe('queued');

		await expect(service.completeJob(
			claimed.processingJobId,
			createWorkerResult(DEFAULT_WORKER_RESULT_ITEMS, 'contact-invented-by-the-model')
		)).rejects.toThrow(
			new ReceiptWorkerResultError('Результат содержит контакт, которого не было в задании.')
		);
	});

	it('creates the regrouped operations when a partially failed approval is resubmitted', async () => {
		const operationService = createOperationService();
		const service = createService(operationService);
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_000 },
			{ name: 'Вода', totalMinor: 250 }
		]));
		const createSpy = failOperationCreateOnCall(operationService, 2);

		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [
				{ amountMinor: 1_000, categoryId: 'category-food', itemIndexes: [0], title: 'Продукты' },
				{ amountMinor: 250, categoryId: 'category-food', itemIndexes: [1], title: 'Вода' }
			],
			version: completed.version
		})).rejects.toThrow('SQLITE_BUSY');

		createSpy.mockRestore();

		const restored = (await service.list(USER_ID)).find((item) => item.id === created.id);

		if (restored === undefined) {
			throw new Error('Expected the receipt to be restored for review.');
		}

		expect(restored.status).toBe('needs_review');
		// The failed attempt left nothing behind: no links, and the 1000 operation it managed to
		// create before the crash is archived out of the ledger.
		expect(restored.operationIds).toHaveLength(0);
		expect(await listLedgerOperations()).toHaveLength(0);

		// The user regroups both items into a single operation and resubmits. A positional
		// group key would collide with the link left behind by the failed attempt and skip it.
		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0, 1],
				title: 'Продукты и вода'
			}],
			version: restored.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);

		const operations = await listLedgerOperations();

		// Exactly what the final submission asked for — the 1000 orphan is not counted on top.
		expect(operations).toHaveLength(1);
		expect(operations[0].amountMinor).toBe(1_250);
		expect(operations.reduce((sum, operation) => sum + operation.amountMinor, 0)).toBe(1_250);
	});

	it('reverses the operations of a failed approval so a resubmission cannot double-count', async () => {
		const operationService = createOperationService();
		const service = createService(operationService);
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_250 },
			{ name: 'Вода', totalMinor: 250 }
		]));
		const createSpy = failOperationCreateOnCall(operationService, 2);

		// The first operation (1250) is written and linked, the second one crashes.
		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [
				{ amountMinor: 1_250, categoryId: 'category-food', itemIndexes: [0], title: 'Продукты' },
				{ amountMinor: 250, categoryId: 'category-food', itemIndexes: [1], title: 'Вода' }
			],
			version: completed.version
		})).rejects.toThrow('SQLITE_BUSY');

		createSpy.mockRestore();

		// No orphan survives: zero ledger operations and zero links, exactly the pre-approval state.
		expect(await listLedgerOperations()).toHaveLength(0);
		expect(await database.select().from(schema.receiptOperationLinks)).toHaveLength(0);

		const restored = (await service.list(USER_ID)).find((item) => item.id === created.id);

		if (restored === undefined) {
			throw new Error('Expected the receipt to be restored for review.');
		}

		expect(restored.status).toBe('needs_review');
		expect(restored.operationIds).toHaveLength(0);

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [
				{ amountMinor: 1_250, categoryId: 'category-food', itemIndexes: [0], title: 'Продукты' },
				{ amountMinor: 250, categoryId: 'category-food', itemIndexes: [1], title: 'Вода' }
			],
			version: restored.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(2);

		const operations = await listLedgerOperations();

		expect(operations).toHaveLength(2);
		// The ledger total matches the receipt total exactly — the 1250 orphan is not counted twice.
		expect(operations.reduce((sum, operation) => sum + operation.amountMinor, 0)).toBe(1_500);
	});

	it('treats a group linked by an earlier attempt as already created', async () => {
		const operationService = createOperationService();
		const service = createService(operationService);
		const { completed, created } = await createReviewableReceipt(service, createWorkerResult([
			{ name: 'Продукты', totalMinor: 1_000 },
			{ name: 'Вода', totalMinor: 250 }
		]));
		// A crash between `addOperationLink` and the next iteration (no catch block runs, e.g. the
		// process dies) can leave a link behind. The approval loop must skip that group, not
		// create a second operation for it.
		const orphanedOperation = await operationService.create(USER_ID, {
			accountId: 'account-receipt',
			amountMinor: 1_000,
			categoryId: 'category-food',
			comment: 'Продукты',
			contactId: 'contact-shop',
			happenedOn: '2026-08-08',
			title: 'Продукты',
			type: 'expense'
		});

		await database.insert(schema.receiptOperationLinks).values({
			createdAt: FIXED_DATE,
			groupKey: '0',
			operationId: orphanedOperation.id,
			receiptImportId: created.id
		});

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [
				{ amountMinor: 1_000, categoryId: 'category-food', itemIndexes: [0], title: 'Продукты' },
				{ amountMinor: 250, categoryId: 'category-food', itemIndexes: [1], title: 'Вода' }
			],
			version: completed.version
		});

		// Only the missing group is created; the already linked one stays idempotent.
		expect(approved.operationIds).toHaveLength(2);
		expect(await listLedgerOperations()).toHaveLength(2);
	});

	it('resets a job stuck in leased status back to queued on recovery', async () => {
		const service = createService();

		await service.createFromImage(USER_ID, {
			bytes: sampleImageBytes,
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		await service.claimNextQueuedJob();

		const recovered = await service.recoverStaleProcessingJobs();

		expect(recovered).toBe(1);

		const claimedAgain = await service.claimNextQueuedJob();

		expect(claimedAgain).not.toBeUndefined();
	});

	it('deletes receipt images only after their retention period passes', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: sampleImageBytes,
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		});

		const beforeRetention = await service.deleteExpiredImages();

		expect(beforeRetention.deletedCount).toBe(0);

		currentDate = new Date(FIXED_DATE.getTime() + 40 * 24 * 60 * 60 * 1_000);

		const afterRetention = await service.deleteExpiredImages();

		expect(afterRetention.deletedCount).toBe(1);
	});
});
