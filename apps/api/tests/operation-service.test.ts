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
	OperationAccountCurrencyMismatchError,
	OperationAccountUnavailableError,
	OperationReferenceUnavailableError,
	OperationRepository,
	OperationService,
	OperationTransferLinkedError,
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
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database));
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

	describe('moving an operation to another account', () => {
		async function insertAccount(values: { archivedAt?: Date; currency: 'BYN' | 'USD'; householdId?: string; id: string }) {
			await database.insert(accounts).values({
				archivedAt: values.archivedAt ?? null,
				color: '#3f77a8',
				createdAt: FIXED_DATE,
				createdByUserId: USER_ID,
				currency: values.currency,
				description: '',
				householdId: values.householdId ?? HOUSEHOLD_ID,
				id: values.id,
				initialBalanceMinor: 0,
				isColorAccentEnabled: false,
				isIncludedInFamilyTotal: true,
				name: values.id,
				type: 'card',
				updatedAt: FIXED_DATE,
				version: 1
			});
		}

		async function createExpense(service: OperationService) {
			return service.create(USER_ID, createOperationInputSchema.parse({
				accountId: 'account-main',
				amountMinor: 2_120,
				categoryId: null,
				comment: '',
				contactId: null,
				happenedOn: '2026-08-08',
				title: 'Воппер',
				type: 'expense'
			}));
		}

		it('moves it to an active account of the same currency and moves the balance with it', async () => {
			await insertAccount({ currency: 'BYN', id: 'account-wife' });

			const service = createService();
			const created = await createExpense(service);
			const moved = await service.update(USER_ID, updateOperationInputSchema.parse({
				...created, accountId: 'account-wife'
			}));

			expect(moved).toMatchObject({
				accountId: 'account-wife',
				amountInHouseholdBaseCurrencyMinor: created.amountInHouseholdBaseCurrencyMinor,
				amountMinor: 2_120,
				currency: 'BYN',
				version: created.version + 1
			});
			expect(await service.getAccountBalances(USER_ID)).toEqual(expect.arrayContaining([
				{ accountId: 'account-main', balanceMinor: 10_000, currency: 'BYN' },
				{ accountId: 'account-wife', balanceMinor: -2_120, currency: 'BYN' }
			]));
		});

		it('puts the moved operation first among the target account entries of that day', async () => {
			await insertAccount({ currency: 'BYN', id: 'account-wife' });

			const service = createService();
			const existingIds: string[] = [];

			// Two entries on the target account give it orders -1 and -2, the source account has only -1: taking the
			// order from the source account would collide with -2 on the unique (account, day, order) index.
			for (const title of ['Уже на счёте жены 1', 'Уже на счёте жены 2']) {
				const existing = await service.create(USER_ID, createOperationInputSchema.parse({
					accountId: 'account-wife',
					amountMinor: 500,
					categoryId: null,
					comment: '',
					contactId: null,
					happenedOn: '2026-08-08',
					title,
					type: 'expense'
				}));

				existingIds.push(existing.id);
			}

			const created = await createExpense(service);
			const moved = await service.update(USER_ID, updateOperationInputSchema.parse({
				...created, accountId: 'account-wife'
			}));
			const ledger = await service.getAccountLedger(USER_ID, {
				accountId: 'account-wife', end: '2026-08-08', start: '2026-08-08'
			});

			expect(ledger.items.map((item) => item.id)).toEqual([moved.id, ...existingIds.reverse()]);
		});

		it('keeps the account when the field is missing or equals the current one', async () => {
			const service = createService();
			const created = await createExpense(service);
			const withoutField = await service.update(USER_ID, updateOperationInputSchema.parse({
				...created, accountId: undefined, title: 'Без поля'
			}));
			const same = await service.update(USER_ID, updateOperationInputSchema.parse({
				...withoutField, accountId: 'account-main', title: 'Тот же счёт'
			}));

			expect(withoutField.accountId).toBe('account-main');
			expect(same).toMatchObject({ accountId: 'account-main', title: 'Тот же счёт' });
		});

		it('refuses an account in another currency and changes nothing', async () => {
			await insertAccount({ currency: 'USD', id: 'account-usd' });

			const service = createService();
			const created = await createExpense(service);

			await expect(service.update(USER_ID, updateOperationInputSchema.parse({
				...created, accountId: 'account-usd'
			}))).rejects.toBeInstanceOf(OperationAccountCurrencyMismatchError);
			expect(await service.getAccountBalances(USER_ID)).toEqual(expect.arrayContaining([
				{ accountId: 'account-main', balanceMinor: 7_880, currency: 'BYN' }
			]));
		});

		it('refuses an archived account, an unknown one and an account of another household', async () => {
			await insertAccount({ archivedAt: FIXED_DATE, currency: 'BYN', id: 'account-archived' });
			await database.insert(households).values({
				baseCurrency: 'BYN', createdAt: FIXED_DATE, id: 'household-2', name: 'Чужая', updatedAt: FIXED_DATE
			});
			await insertAccount({ currency: 'BYN', householdId: 'household-2', id: 'account-foreign' });

			const service = createService();
			const created = await createExpense(service);

			for (const accountId of ['account-archived', 'account-missing', 'account-foreign']) {
				await expect(service.update(USER_ID, updateOperationInputSchema.parse({
					...created, accountId
				}))).rejects.toBeInstanceOf(OperationAccountUnavailableError);
			}

			expect(await service.getAccountBalances(USER_ID)).toEqual(expect.arrayContaining([
				{ accountId: 'account-main', balanceMinor: 7_880, currency: 'BYN' }
			]));
		});

		it('answers 409 reference-unavailable with the account field through HTTP', async () => {
			await insertAccount({ currency: 'USD', id: 'account-usd' });

			const service = createService();
			const created = await createExpense(service);
			const app = createApiApp({
				operationController: new OperationHttpController(service, { resolve: async () => authenticatedSession })
			});
			const response = await app.request(`/api/operations/${created.id}`, {
				body: JSON.stringify({ ...created, accountId: 'account-usd' }),
				headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
				method: 'PUT'
			});

			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({
				errorCode: 'reference-unavailable',
				fieldErrors: { accountId: expect.any(String) },
				ok: false
			});
		});
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

	it('refuses to edit, archive, or recalculate a transfer-linked operation directly', async () => {
		await database.insert(accounts).values({
			archivedAt: null,
			color: '#a06368',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'USD',
			description: '',
			householdId: HOUSEHOLD_ID,
			id: 'account-transfer-target',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'USD счёт',
			type: 'card',
			updatedAt: FIXED_DATE,
			version: 1
		});

		const service = createService();
		const operation = await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 500,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-08',
			title: 'Перевод → Основной счёт',
			type: 'income'
		}));

		// Simulate a transfer leg without pulling in the transfer module: only
		// the operations.transferId column matters to this guard, but the
		// column has a real foreign key, so a matching row must exist.
		await database.insert(schema.transfers).values({
			comment: '',
			contactId: null,
			contactNameSnapshot: null,
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			deletedAt: null,
			deletedByUserId: null,
			exchangeFromCurrency: 'USD',
			exchangeRate: '1',
			exchangeToCurrency: 'BYN',
			fromAccountId: 'account-transfer-target',
			fromAmountMinor: 500,
			happenedOn: '2026-08-08',
			householdId: HOUSEHOLD_ID,
			id: 'transfer-1',
			toAccountId: 'account-main',
			toAmountMinor: 500,
			updatedAt: FIXED_DATE,
			updatedByUserId: USER_ID,
			version: 1
		});
		await database.update(schema.operations)
			.set({ transferId: 'transfer-1' })
			.where(eq(schema.operations.id, operation.id));

		await expect(service.update(USER_ID, updateOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 600,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-08',
			id: operation.id,
			title: 'Изменено',
			type: 'income',
			version: operation.version
		}))).rejects.toBeInstanceOf(OperationTransferLinkedError);

		await expect(service.archive(USER_ID, {
			id: operation.id,
			version: operation.version
		})).rejects.toBeInstanceOf(OperationTransferLinkedError);

		await expect(service.recalculateRate(USER_ID, {
			id: operation.id,
			version: operation.version
		})).rejects.toBeInstanceOf(OperationTransferLinkedError);
	});
});
