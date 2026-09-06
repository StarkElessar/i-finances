import { createApiApp } from '@/app';
import { OperationHttpController } from '@/http/operation-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	categories,
	contacts,
	exchangeRates,
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
import {
	OperationReferenceUnavailableError,
	OperationRepository,
	OperationService,
	OperationVersionConflictError
} from '@/modules/operation';

import { createOperationInputSchema, updateOperationInputSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-08-08T10:00:00.000Z');
const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-09-08T10:00:00.000Z'),
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
		initialBalanceMinor: 10_000,
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

describe('OperationService', () => {
	it('creates a currency snapshot and returns household-scoped ledger aggregates', async () => {
		await database.insert(exchangeRates).values({
			createdAt: FIXED_DATE,
			effectiveOn: '2026-08-07',
			fromCurrency: 'USD',
			id: 'rate-usd-byn',
			rate: '3',
			source: 'test',
			toCurrency: 'BYN',
			updatedAt: FIXED_DATE
		});
		await database.insert(accounts).values({
			archivedAt: null,
			color: '#a06368',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'USD',
			description: '',
			householdId: HOUSEHOLD_ID,
			id: 'account-usd',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'USD счёт',
			type: 'card',
			updatedAt: FIXED_DATE,
			version: 1
		});
		const service = createService();

		const expense = await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-usd',
			amountMinor: 250,
			categoryId: 'category-food',
			comment: '  Чек  ',
			contactId: null,
			happenedOn: '2026-08-08',
			title: '  Продукты  ',
			type: 'expense'
		}));
		const income = await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 10_000,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-08',
			title: 'Зарплата',
			type: 'income'
		}));

		expect(expense).toMatchObject({
			amountInHouseholdBaseCurrencyMinor: 750,
			categoryName: 'Продукты',
			exchangeRate: { effectiveOn: '2026-08-07', rate: '3' },
			title: 'Продукты'
		});
		expect(income.exchangeRate).toMatchObject({ rate: '1', source: 'identity' });

		const ledger = await service.getAccountLedger(USER_ID, {
			accountId: 'account-main',
			end: '2026-08-08',
			start: '2026-08-01'
		});
		const balances = await service.getAccountBalances(USER_ID);
		const summary = await service.getMonthlyExpenseSummary(USER_ID, { month: '2026-08' });

		expect(ledger).toMatchObject({
			closingBalanceMinor: 20_000,
			openingBalanceMinor: 10_000
		});
		expect(ledger.items).toHaveLength(1);
		expect(balances).toEqual(expect.arrayContaining([
			{ accountId: 'account-main', balanceMinor: 20_000, currency: 'BYN' },
			{ accountId: 'account-usd', balanceMinor: -250, currency: 'USD' }
		]));
		expect(summary).toMatchObject({
			baseCurrency: 'BYN',
			categoryExpensesMinor: { 'category-food': 750 },
			month: '2026-08'
		});
	});

	it('updates with optimistic locking and excludes archived operations from balances', async () => {
		const service = createService();
		const created = await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 1_000,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-08',
			title: 'Покупка',
			type: 'expense'
		}));
		const updated = await service.update(USER_ID, updateOperationInputSchema.parse({
			...created,
			amountMinor: 1_500,
			categoryId: null,
			comment: '',
			contactId: null,
			title: 'Обновлённая покупка'
		}));

		expect(updated).toMatchObject({ amountMinor: 1_500, title: 'Обновлённая покупка', version: 2 });
		await expect(service.update(USER_ID, updateOperationInputSchema.parse({
			...updated,
			version: created.version
		}))).rejects.toBeInstanceOf(OperationVersionConflictError);

		const archived = await service.archive(USER_ID, { id: updated.id, version: updated.version });
		const balances = await service.getAccountBalances(USER_ID);

		expect(archived.deletedAt).not.toBeNull();
		expect(balances).toEqual([
			{ accountId: 'account-main', balanceMinor: 10_000, currency: 'BYN' }
		]);
	});

	it('keeps a current archived contact reference but rejects selecting it anew', async () => {
		await database.insert(contacts).values({
			archivedAt: null,
			color: '#3f77a8',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			householdId: HOUSEHOLD_ID,
			id: 'contact-main',
			legalName: null,
			name: 'Магазин',
			normalizedLegalName: null,
			normalizedName: 'магазин',
			type: 'company',
			updatedAt: FIXED_DATE,
			version: 1
		});
		const service = createService();
		const created = await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 1_000,
			categoryId: null,
			comment: '',
			contactId: 'contact-main',
			happenedOn: '2026-08-08',
			title: 'Покупка',
			type: 'expense'
		}));

		await database.update(contacts).set({ archivedAt: FIXED_DATE }).where(eq(contacts.id, 'contact-main'));

		await expect(service.update(USER_ID, updateOperationInputSchema.parse({
			...created,
			version: created.version
		}))).resolves.toMatchObject({ contactId: 'contact-main' });
		await expect(service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 1_000,
			categoryId: null,
			comment: '',
			contactId: 'contact-main',
			happenedOn: '2026-08-08',
			title: 'Вторая покупка',
			type: 'expense'
		}))).rejects.toBeInstanceOf(OperationReferenceUnavailableError);
	});

	it('lists category and contact operations with the live account name', async () => {
		await database.insert(contacts).values({
			archivedAt: null,
			color: '#a06368',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			householdId: HOUSEHOLD_ID,
			id: 'contact-shop',
			legalName: null,
			name: 'Магазин у дома',
			normalizedLegalName: null,
			normalizedName: 'магазин у дома',
			phone: null,
			type: 'company',
			updatedAt: FIXED_DATE,
			version: 1
		});

		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 1_500,
			categoryId: 'category-food',
			comment: '',
			contactId: 'contact-shop',
			happenedOn: '2026-08-08',
			title: 'Хлеб',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 900,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-08-09',
			title: 'Молоко',
			type: 'expense'
		}));

		const byCategory = await service.getCategoryOperations(USER_ID, {
			categoryId: 'category-food',
			end: '2026-08-31',
			start: '2026-08-01'
		});
		const byContact = await service.getContactOperations(USER_ID, {
			contactId: 'contact-shop',
			end: '2026-08-31',
			start: '2026-08-01'
		});

		expect(byCategory).toMatchObject({
			categoryId: 'category-food',
			householdBaseCurrency: 'BYN',
			range: { end: '2026-08-31', start: '2026-08-01' }
		});
		expect(byCategory.items.map((item) => item.title)).toEqual(['Молоко', 'Хлеб']);
		expect(byCategory.items[0]).toMatchObject({ accountName: 'Основной счёт' });

		expect(byContact.items).toHaveLength(1);
		expect(byContact.items[0]).toMatchObject({
			accountName: 'Основной счёт',
			contactName: 'Магазин у дома',
			title: 'Хлеб'
		});
	});

	it('rejects drill-downs for references outside the household', async () => {
		const service = createService();

		await expect(service.getCategoryOperations(USER_ID, {
			categoryId: 'category-missing',
			end: '2026-08-31',
			start: '2026-08-01'
		})).rejects.toBeInstanceOf(OperationReferenceUnavailableError);

		await expect(service.getContactOperations(USER_ID, {
			contactId: 'contact-missing',
			end: '2026-08-31',
			start: '2026-08-01'
		})).rejects.toBeInstanceOf(OperationReferenceUnavailableError);
	});

	it('exposes balances through the authenticated HTTP boundary', async () => {
		const noSessionResolver: RequestSessionResolver = {
			resolve: async () => null
		};
		const sessionResolver: RequestSessionResolver = {
			resolve: async () => authenticatedSession
		};
		const unauthenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), noSessionResolver)
		});
		const authenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), sessionResolver)
		});

		expect((await unauthenticatedApp.request('/api/operations/balances')).status).toBe(401);
		const response = await authenticatedApp.request('/api/operations/balances');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([{
			accountId: 'account-main',
			balanceMinor: 10_000,
			currency: 'BYN'
		}]);
	});
});
