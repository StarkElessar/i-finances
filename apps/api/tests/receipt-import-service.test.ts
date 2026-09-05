import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { accounts, categories, householdMembers, households, users } from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';
import {
	createReceiptImageStorage,
	createReceiptImportRepository,
	ReceiptImportService
} from '@/modules/receipt-import';

import {
	receiptWorkerResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-receipt';
const HOUSEHOLD_ID = 'household-receipt';
const FIXED_DATE = new Date('2026-08-08T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let imageRoot: string;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	imageRoot = await mkdtemp(join(tmpdir(), 'i-finances-receipts-'));

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
});

afterEach(async () => {
	connection.close();
	await rm(imageRoot, { force: true, recursive: true });
});

function createService(): ReceiptImportService {
	let idSequence = 0;
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));
	const operationService = new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository: {
			findById: async () => undefined
		},
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		operationRepository: new OperationRepository(database),
		now: () => FIXED_DATE
	});

	return new ReceiptImportService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		householdResolver,
		imageStorage: createReceiptImageStorage({ rootDirectory: imageRoot }),
		operationService,
		receiptImportRepository: createReceiptImportRepository(database),
		createId: () => `receipt-${++idSequence}`,
		now: () => FIXED_DATE
	});
}

function createWorkerResult(workerId: string) {
	return receiptWorkerResultSchema.parse({
		categorizedItems: [{ categoryId: 'category-food', confidence: 0.99, itemIndex: 0 }],
		processor: {
			finishedAt: FIXED_DATE.toISOString(),
			modelVersions: ['test-model'],
			pipelineVersion: 'receipt-local-v1',
			startedAt: FIXED_DATE.toISOString(),
			workerId
		},
		rawOcrText: 'Продукты 12.50',
		receipt: {
			currency: 'BYN',
			happenedOn: '2026-08-08',
			items: [{
				discountMinor: 0,
				name: 'Продукты',
				quantity: 1,
				totalMinor: 1_250,
				unitPriceMinor: 1_250
			}],
			merchant: {
				address: null,
				displayName: 'Магазин',
				legalName: null,
				unp: null
			},
			totalAmountMinor: 1_250
		},
		schemaVersion: 1,
		warnings: []
	});
}

describe('ReceiptImportService', () => {
	it('keeps the review boundary and creates linked operations only after approval', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const leased = await service.leaseNextJob('worker-1');

		expect(created.status).toBe('queued');
		expect(leased).toMatchObject({ receiptImportId: created.id, requestedPipelineVersion: 'receipt-local-v1' });

		if (leased === undefined) {
			throw new Error('Expected a leased receipt job.');
		}

		const result = createWorkerResult('worker-1');
		const completed = await service.completeJob(leased.processingJobId, {
			leaseToken: leased.leaseToken,
			result
		});

		expect(completed.status).toBe('needs_review');
		expect(completed.operationIds).toEqual([]);

		const duplicateCompletion = await service.completeJob(leased.processingJobId, {
			leaseToken: leased.leaseToken,
			result
		});

		expect(duplicateCompletion.id).toBe(created.id);

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
		expect(updatedReview.result?.receipt.items[0]?.totalMinor).toBe(1_300);

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			id: created.id,
			version: updatedReview.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);

		const operations = await database.select().from(schema.operations);

		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({ amountMinor: 1_300, categoryId: 'category-food' });
	});
});
