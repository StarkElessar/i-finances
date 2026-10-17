import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	contacts,
	householdMembers,
	households,
	operations,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository } from '@/modules/operation';
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

	it('records a transfer between accounts sharing one currency', async () => {
		const transfer = await createService().create(USER_ID, {
			...validInput,
			exchangeRate: '1',
			fromAccountId: 'account-byn',
			toAccountId: 'account-byn-2'
		});

		expect(transfer).toMatchObject({
			exchangeFromCurrency: 'BYN',
			exchangeRate: '1',
			exchangeToCurrency: 'BYN',
			fromAmountMinor: 10_000,
			toAmountMinor: 10_000
		});

		const legs = await database.select()
			.from(operations)
			.where(eq(operations.transferId, transfer.id));

		expect(legs).toHaveLength(2);
		expect(legs.every((leg) => leg.amountInHouseholdBaseCurrencyMinor === 10_000)).toBe(true);
		expect(legs.every((leg) => leg.exchangeRateSource === 'identity')).toBe(true);
	});

	it('ignores a client rate for a same-currency transfer', async () => {
		const transfer = await createService().create(USER_ID, {
			...validInput,
			exchangeRate: '3',
			fromAccountId: 'account-byn',
			toAccountId: 'account-byn-2'
		});

		expect(transfer.exchangeRate).toBe('1');
		expect(transfer.toAmountMinor).toBe(transfer.fromAmountMinor);
	});

	it('refuses a transfer to the same account', async () => {
		await expect(createService().create(USER_ID, {
			...validInput,
			fromAccountId: 'account-byn',
			toAccountId: 'account-byn'
		})).rejects.toThrow();
	});

	it('moves an existing transfer between cross-currency and same-currency pairs', async () => {
		const service = createService();
		const created = await service.create(USER_ID, validInput);

		const toSame = await service.update(USER_ID, {
			...validInput,
			exchangeRate: '1',
			fromAccountId: 'account-byn',
			id: created.id,
			toAccountId: 'account-byn-2',
			version: created.version
		});

		expect(toSame).toMatchObject({
			exchangeFromCurrency: 'BYN',
			exchangeRate: '1',
			exchangeToCurrency: 'BYN',
			toAmountMinor: 10_000,
			version: created.version + 1
		});

		const back = await service.update(USER_ID, {
			...validInput,
			id: created.id,
			version: toSame.version
		});

		expect(back).toMatchObject({
			exchangeFromCurrency: 'USD',
			exchangeRate: '3',
			exchangeToCurrency: 'BYN',
			toAmountMinor: 30_000
		});
	});

	it('keeps transfer legs out of per-contact expense totals', async () => {
		await database.insert(contacts).values({
			archivedAt: null,
			color: '#3f77a8',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			householdId: HOUSEHOLD_ID,
			id: 'contact-1',
			legalName: null,
			name: 'Евроопт',
			normalizedLegalName: null,
			normalizedName: 'евроопт',
			phone: null,
			type: 'company',
			updatedAt: FIXED_DATE,
			version: 1
		});
		await database.insert(operations).values({
			accountId: 'account-byn',
			amountInHouseholdBaseCurrencyMinor: 700,
			amountMinor: 700,
			categoryId: null,
			categoryNameSnapshot: null,
			comment: '',
			contactId: 'contact-1',
			contactNameSnapshot: 'Евроопт',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'BYN',
			deletedAt: null,
			deletedByUserId: null,
			exchangeRate: '1',
			exchangeRateEffectiveOn: '2026-09-06',
			exchangeRateSource: 'identity',
			happenedOn: '2026-09-06',
			householdBaseCurrency: 'BYN',
			householdId: HOUSEHOLD_ID,
			id: 'expense-1',
			sourceOrder: 1,
			title: 'Покупка',
			transferId: null,
			type: 'expense',
			updatedAt: FIXED_DATE,
			updatedByUserId: USER_ID,
			version: 1
		});
		await createService().create(USER_ID, {
			...validInput,
			contactId: 'contact-1'
		});

		const totals = await new OperationRepository(database).listMonthlyContactExpenses(
			HOUSEHOLD_ID,
			'2026-09-01',
			'2026-09-30'
		);

		expect(totals).toEqual([{ referenceId: 'contact-1', totalMinor: 700 }]);
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
