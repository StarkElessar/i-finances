import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	householdMembers,
	households,
	operations,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import type { TransferService } from '@/modules/transfer';
import {
	createTransferRepository,
	createTransferService,
	TransferDeletedError
} from '@/modules/transfer';

import Database from 'better-sqlite3';
import { eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const FIXED_DATE = new Date('2026-09-06T10:00:00.000Z');
const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';

let connection: Database.Database;
let database: AppDatabase;

function insertAccount(id: string, name: string, currency: 'BYN' | 'USD'): Promise<unknown> {
	return database.insert(accounts).values({
		archivedAt: null,
		color: '#3f77a8',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		currency,
		description: '',
		householdId: HOUSEHOLD_ID,
		id,
		initialBalanceMinor: 100_000,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name,
		type: 'card',
		updatedAt: FIXED_DATE,
		version: 1
	});
}

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
	await insertAccount('account-byn', 'Наличка', 'BYN');
	await insertAccount('account-usd', 'Долларовый', 'USD');
	await insertAccount('account-byn-2', 'Карта', 'BYN');
});

afterEach(() => {
	connection.close();
});

function createService(): TransferService {
	let sequence = 0;

	return createTransferService({
		accountRepository: new AccountRepository(database),
		contactRepository: new ContactRepository(database),
		createId: () => `id-${++sequence}`,
		exchangeRateResolver: new ExchangeRateService(new ExchangeRateRepository(database)),
		householdResolver: new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE),
		now: () => FIXED_DATE,
		transferRepository: createTransferRepository(database)
	});
}

const validInput = {
	comment: '',
	contactId: null,
	exchangeRate: '3',
	fromAccountId: 'account-usd',
	fromAmountMinor: 10_000,
	happenedOn: '2026-09-06',
	toAccountId: 'account-byn'
};

describe('TransferService', () => {
	it('writes a transfer as two linked operation legs', async () => {
		const transfer = await createService().create(USER_ID, validInput);

		expect(transfer).toMatchObject({
			exchangeFromCurrency: 'USD',
			exchangeToCurrency: 'BYN',
			fromAmountMinor: 10_000,
			toAmountMinor: 30_000
		});

		const legs = await database.select()
			.from(operations)
			.where(isNotNull(operations.transferId));

		expect(legs).toHaveLength(2);
		expect(legs.every((leg) => leg.transferId === transfer.id)).toBe(true);
		expect(legs.every((leg) => leg.categoryId === null)).toBe(true);
		expect(legs.map((leg) => leg.type).sort()).toEqual(['expense', 'income']);
		// Both legs must agree on the base amount or balances drift apart.
		expect(new Set(legs.map((leg) => leg.amountInHouseholdBaseCurrencyMinor))).toEqual(
			new Set([30_000])
		);
	});

	it('refuses a transfer between accounts sharing one currency', async () => {
		await expect(createService().create(USER_ID, {
			...validInput,
			fromAccountId: 'account-byn',
			toAccountId: 'account-byn-2'
		})).rejects.toThrow();
	});

	it('soft-deletes both legs together and then refuses to delete twice', async () => {
		const service = createService();
		const transfer = await service.create(USER_ID, validInput);

		const deleted = await service.softDelete(USER_ID, {
			id: transfer.id,
			version: transfer.version
		});

		expect(deleted.deletedAt).not.toBeNull();

		const legs = await database.select()
			.from(operations)
			.where(eq(operations.transferId, transfer.id));

		expect(legs).toHaveLength(2);
		expect(legs.every((leg) => leg.deletedAt !== null)).toBe(true);

		await expect(service.softDelete(USER_ID, {
			id: transfer.id,
			version: transfer.version
		})).rejects.toBeInstanceOf(TransferDeletedError);
	});
});
