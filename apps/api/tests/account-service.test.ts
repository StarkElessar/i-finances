import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	householdMembers,
	households,
	operations,
	users
} from '@/infrastructure/database/schema';
import {
	AccountCurrencyLockedError,
	AccountRepository,
	AccountService,
	AccountVersionConflictError
} from '@/modules/account';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';

import {
	createAccountInputSchema,
	updateAccountInputSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it
} from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const OTHER_HOUSEHOLD_ID = 'household-2';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

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
	await database.insert(households).values([
		{
			baseCurrency: 'BYN',
			createdAt: FIXED_DATE,
			id: HOUSEHOLD_ID,
			name: 'Семья',
			updatedAt: FIXED_DATE
		},
		{
			baseCurrency: 'USD',
			createdAt: FIXED_DATE,
			id: OTHER_HOUSEHOLD_ID,
			name: 'Другая семья',
			updatedAt: FIXED_DATE
		}
	]);
	await database.insert(householdMembers).values({
		householdId: HOUSEHOLD_ID,
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
});

afterEach(() => {
	connection.close();
});

function createService(): AccountService {
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);

	return new AccountService({
		accountRepository: new AccountRepository(database),
		createId: () => 'account-main',
		householdResolver,
		now: () => FIXED_DATE
	});
}

function accountInput(currency: 'BYN' | 'EUR' | 'USD' = 'BYN') {
	return createAccountInputSchema.parse({
		color: '#3f77a8',
		currency,
		description: '',
		initialBalanceMinor: 10_000,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: 'Основной счёт',
		type: 'card'
	});
}

describe('AccountService', () => {
	it('creates, lists only the active household, and enforces optimistic locking', async () => {
		const service = createService();
		const created = await service.create(USER_ID, accountInput());

		await database.insert(accounts).values({
			archivedAt: null,
			color: '#d95959',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'USD',
			description: '',
			householdId: OTHER_HOUSEHOLD_ID,
			id: 'account-other',
			initialBalanceMinor: 1,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Чужой счёт',
			type: 'cash',
			updatedAt: FIXED_DATE,
			version: 1
		});

		const collection = await service.list(USER_ID, false);

		expect(collection.items).toEqual([created]);
		expect(created.hasOperations).toBe(false);
		expect(collection.baseCurrency).toBe('BYN');

		const updated = await service.update(USER_ID, updateAccountInputSchema.parse({
			...accountInput(),
			description: 'Обновлено',
			id: created.id,
			version: created.version
		}));

		expect(updated).toMatchObject({ description: 'Обновлено', version: 2 });
		await expect(service.update(USER_ID, updateAccountInputSchema.parse({
			...accountInput(),
			id: created.id,
			version: created.version
		}))).rejects.toBeInstanceOf(AccountVersionConflictError);
	});

	it('archives and restores accounts idempotently', async () => {
		const service = createService();
		const created = await service.create(USER_ID, accountInput());
		const archived = await service.archive(USER_ID, {
			id: created.id,
			version: created.version
		});
		const archivedAgain = await service.archive(USER_ID, {
			id: archived.id,
			version: archived.version
		});
		const restored = await service.restore(USER_ID, {
			id: archived.id,
			version: archived.version
		});

		expect(archived.version).toBe(2);
		expect(archivedAgain).toEqual(archived);
		expect(restored).toMatchObject({ archivedAt: null, version: 3 });
	});

	it('lets an account without operations change its currency', async () => {
		const service = createService();
		const created = await service.create(USER_ID, accountInput('USD'));

		expect(created.hasOperations).toBe(false);

		const updated = await service.update(USER_ID, updateAccountInputSchema.parse({
			...accountInput('EUR'),
			id: created.id,
			version: created.version
		}));

		expect(updated).toMatchObject({ currency: 'EUR', hasOperations: false, version: 2 });
	});

	describe('with operations', () => {
		async function createAccountWithOperation() {
			const service = createService();
			const created = await service.create(USER_ID, accountInput('USD'));

			await database.insert(operations).values({
				accountId: created.id,
				amountInHouseholdBaseCurrencyMinor: 300,
				amountMinor: 100,
				categoryId: null,
				categoryNameSnapshot: null,
				comment: '',
				contactId: null,
				contactNameSnapshot: null,
				createdAt: FIXED_DATE,
				createdByUserId: USER_ID,
				currency: 'USD',
				deletedAt: null,
				deletedByUserId: null,
				exchangeRate: '3',
				exchangeRateEffectiveOn: '2026-07-20',
				exchangeRateSource: 'test',
				happenedOn: '2026-07-20',
				householdBaseCurrency: 'BYN',
				householdId: HOUSEHOLD_ID,
				id: 'operation-1',
				sourceOrder: 0,
				title: 'Тестовая операция',
				type: 'expense',
				updatedAt: FIXED_DATE,
				updatedByUserId: USER_ID,
				version: 1
			});

			return { created, service };
		}

		it('reports hasOperations in the account list', async () => {
			const { created, service } = await createAccountWithOperation();
			const { items } = await service.list(USER_ID, false);

			expect(items).toEqual([{ ...created, hasOperations: true }]);
		});

		it('refuses a currency change and leaves the account and operations untouched', async () => {
			const { created, service } = await createAccountWithOperation();

			await expect(service.update(USER_ID, updateAccountInputSchema.parse({
				...accountInput('EUR'),
				id: created.id,
				version: created.version
			}))).rejects.toBeInstanceOf(AccountCurrencyLockedError);

			const [account] = await database.select().from(accounts);
			const [operation] = await database.select().from(operations);

			expect(account).toMatchObject({ currency: 'USD', version: 1 });
			expect(operation).toMatchObject({ currency: 'USD', version: 1 });
		});

		it('still lets other fields change while the currency stays the same', async () => {
			const { created, service } = await createAccountWithOperation();
			const updated = await service.update(USER_ID, updateAccountInputSchema.parse({
				...accountInput('USD'),
				id: created.id,
				name: 'Переименован',
				version: created.version
			}));

			expect(updated).toMatchObject({
				currency: 'USD',
				hasOperations: true,
				name: 'Переименован'
			});
		});
	});
});
