import { createApiApp } from '@/app';
import { OperationHttpController } from '@/http/operation-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	categories,
	contacts,
	householdMembers,
	households,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import type { AuthenticatedSession } from '@/modules/auth';
import { CategoryRepository } from '@/modules/category';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';
import type { TransferService } from '@/modules/transfer';
import { createTransferRepository, createTransferService } from '@/modules/transfer';

import { createOperationInputSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-09-08T10:00:00.000Z');

const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-10-08T10:00:00.000Z'),
	id: 'session-1',
	user: {
		displayName: 'Sergei Test',
		id: USER_ID,
		username: 'sergei'
	}
};

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Семья',
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
		id: 'account-main',
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
	await database.insert(categories).values({
		archivedAt: null,
		color: '#be3d5e',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'category-fastfood',
		monthlyBudgetMinor: 20_000,
		name: 'Фастфуд',
		normalizedName: 'фастфуд',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(contacts).values({
		archivedAt: null,
		color: '#3f77a8',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		householdId: HOUSEHOLD_ID,
		id: 'contact-evroopt',
		legalName: null,
		name: 'Евроопт',
		normalizedLegalName: null,
		normalizedName: 'евроопт',
		phone: null,
		type: 'company',
		updatedAt: FIXED_DATE,
		version: 1
	});
});

afterEach(() => {
	connection.close();
});

function createService(): OperationService {
	let operationSequence = 0;
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));

	return new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository: new ContactRepository(database),
		createId: () => `operation-${++operationSequence}`,
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		now: () => FIXED_DATE,
		operationRepository: new OperationRepository(database)
	});
}

function createTransferServiceForTest(): TransferService {
	let sequence = 0;

	return createTransferService({
		accountRepository: new AccountRepository(database),
		contactRepository: new ContactRepository(database),
		createId: () => `transfer-${++sequence}`,
		exchangeRateResolver: new ExchangeRateService(new ExchangeRateRepository(database)),
		householdResolver: new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE),
		now: () => FIXED_DATE,
		transferRepository: createTransferRepository(database)
	});
}

function expense(overrides: {
	amountMinor: number;
	categoryId?: string | null;
	contactId?: string | null;
	happenedOn: string;
	type?: 'expense' | 'income';
}) {
	return createOperationInputSchema.parse({
		accountId: 'account-main',
		amountMinor: overrides.amountMinor,
		categoryId: overrides.categoryId ?? null,
		comment: '',
		contactId: overrides.contactId ?? null,
		happenedOn: overrides.happenedOn,
		title: 'Трата',
		type: overrides.type ?? 'expense'
	});
}

describe('OperationService monthly breakdown', () => {
	it('groups expenses by category and month inside the inclusive range', async () => {
		const service = createService();

		await service.create(USER_ID, expense({ amountMinor: 1_000, categoryId: 'category-food', happenedOn: '2026-06-30' }));
		await service.create(USER_ID, expense({ amountMinor: 2_000, categoryId: 'category-food', happenedOn: '2026-07-01' }));
		await service.create(USER_ID, expense({ amountMinor: 3_000, categoryId: 'category-food', happenedOn: '2026-07-31' }));
		await service.create(USER_ID, expense({ amountMinor: 4_000, categoryId: 'category-fastfood', happenedOn: '2026-08-15' }));
		await service.create(USER_ID, expense({ amountMinor: 5_000, categoryId: 'category-food', happenedOn: '2026-08-31' }));
		await service.create(USER_ID, expense({ amountMinor: 6_000, categoryId: 'category-food', happenedOn: '2026-09-01' }));

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'category', from: '2026-07', to: '2026-08' });

		expect(breakdown).toMatchObject({ baseCurrency: 'BYN', by: 'category', from: '2026-07', to: '2026-08' });
		expect(breakdown.cells.toSorted((a, b) => `${a.referenceId}${a.month}`.localeCompare(`${b.referenceId}${b.month}`)))
			.toEqual([
				{ month: '2026-08', referenceId: 'category-fastfood', totalMinor: 4_000 },
				{ month: '2026-07', referenceId: 'category-food', totalMinor: 5_000 },
				{ month: '2026-08', referenceId: 'category-food', totalMinor: 5_000 }
			]);
	});

	it('groups by contact and ignores operations without a contact', async () => {
		const service = createService();

		await service.create(USER_ID, expense({ amountMinor: 7_000, contactId: 'contact-evroopt', happenedOn: '2026-09-02' }));
		await service.create(USER_ID, expense({ amountMinor: 9_000, categoryId: 'category-food', happenedOn: '2026-09-03' }));

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'contact', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([{ month: '2026-09', referenceId: 'contact-evroopt', totalMinor: 7_000 }]);
	});

	it('excludes income and deleted operations', async () => {
		const service = createService();

		await service.create(USER_ID, expense({
			amountMinor: 100_000,
			categoryId: 'category-food',
			happenedOn: '2026-09-02',
			type: 'income'
		}));
		const deleted = await service.create(USER_ID, expense({
			amountMinor: 8_000,
			categoryId: 'category-food',
			happenedOn: '2026-09-02'
		}));

		await service.archive(USER_ID, { id: deleted.id, version: deleted.version });

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'category', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([]);
	});

	it('excludes transfer legs even when they carry a contact', async () => {
		await database.insert(accounts).values({
			archivedAt: null,
			color: '#8899aa',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'USD',
			description: '',
			householdId: HOUSEHOLD_ID,
			id: 'account-savings',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Сбережения',
			type: 'savings',
			updatedAt: FIXED_DATE,
			version: 1
		});

		await createTransferServiceForTest().create(USER_ID, {
			comment: '',
			contactId: 'contact-evroopt',
			exchangeRate: '3',
			fromAccountId: 'account-savings',
			fromAmountMinor: 50_000,
			happenedOn: '2026-09-05',
			toAccountId: 'account-main'
		});

		const breakdown = await createService().getMonthlyBreakdown(USER_ID, { by: 'contact', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([]);
	});

	it('exposes monthly-breakdown through the authenticated HTTP boundary', async () => {
		const noSessionResolver: RequestSessionResolver = { resolve: async () => null };
		const sessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };
		const unauthenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), noSessionResolver)
		});
		const app = createApiApp({
			operationController: new OperationHttpController(createService(), sessionResolver)
		});

		expect((await unauthenticatedApp.request('/api/operations/monthly-breakdown?by=category&from=2026-09&to=2026-09')).status)
			.toBe(401);
		const reversedRange = await app.request('/api/operations/monthly-breakdown?by=category&from=2026-09&to=2026-01');
		const unknownDimension = await app.request('/api/operations/monthly-breakdown?by=nope&from=2026-01&to=2026-02');

		expect(reversedRange.status).toBe(400);
		expect(unknownDimension.status).toBe(400);

		const response = await app.request('/api/operations/monthly-breakdown?by=category&from=2026-01&to=2026-09');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ baseCurrency: 'BYN', by: 'category', cells: [], from: '2026-01', to: '2026-09' });
	});
});
