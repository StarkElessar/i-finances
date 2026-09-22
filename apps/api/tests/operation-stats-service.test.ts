import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	categories,
	householdMembers,
	households,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';

import { createOperationInputSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-09-08T10:00:00.000Z');

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

describe('OperationService category stats', () => {
	it('averages history before the selected month and flags the delta', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 10_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-07-05',
			title: 'Июль',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 20_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-08-05',
			title: 'Август',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 45_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Сентябрь',
			type: 'expense'
		}));

		const stats = await service.getCategoryStats(USER_ID, { month: '2026-09' });

		expect(stats).toMatchObject({
			baseCurrency: 'BYN',
			month: '2026-09'
		});
		expect(stats.items).toEqual([{
			averageMinor: 15_000,
			categoryId: 'category-food',
			currentMinor: 45_000,
			deltaPercent: 200,
			monthsIncludedCount: 2
		}]);
	});

	it('returns null average and delta for a category with no history before the month', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 5_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Первая трата',
			type: 'expense'
		}));

		const stats = await service.getCategoryStats(USER_ID, { month: '2026-09' });

		expect(stats.items).toEqual([{
			averageMinor: null,
			categoryId: 'category-food',
			currentMinor: 5_000,
			deltaPercent: null,
			monthsIncludedCount: 0
		}]);
	});
});

describe('OperationService monthly trend', () => {
	it('aggregates expense and income per month across the full history', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 10_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-08-05',
			title: 'Расход',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 200_000,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-10',
			title: 'Зарплата',
			type: 'income'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 15_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Расход',
			type: 'expense'
		}));

		const trend = await service.getMonthlyTrend(USER_ID);

		expect(trend).toEqual({
			baseCurrency: 'BYN',
			points: [
				{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' },
				{ expenseMinor: 15_000, incomeMinor: 0, month: '2026-09' }
			]
		});
	});
});
