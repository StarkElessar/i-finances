import {
	AccentColor,
	AccountColor,
	AccountType,
	CurrencyCode
} from '~/shared/lib';

import { createAccountRepository } from '~/server/account/account-repository';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createContactRepository } from '~/server/contact/contact-repository';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
	accounts,
	contacts,
	householdMembers,
	households,
	users
} from '~/server/db/schema';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import {
	createExchangeRateService,
	type ExchangeRateService
} from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { OperationTransferLinkedError } from '~/server/operation/operation-errors';
import { createOperationRepository } from '~/server/operation/operation-repository';
import {
	createOperationService,
	type OperationService
} from '~/server/operation/operation-service';
import { TransferAccountsInvalidError } from '~/server/transfer/transfer-errors';
import { createTransferRepository } from '~/server/transfer/transfer-repository';
import {
	createTransferService,
	type TransferService
} from '~/server/transfer/transfer-service';

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
const USD_ACCOUNT_ID = 'account-usd';
const BYN_ACCOUNT_ID = 'account-byn';
const CONTACT_ID = 'contact-alfa';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let exchangeRateSequence: number;
let exchangeRateService: ExchangeRateService;
let idSequence: number;
let operationService: OperationService;
let transferService: TransferService;

function createServices() {
	const accountRepository = createAccountRepository(database);
	const contactRepository = createContactRepository(database);
	const householdResolver = createHouseholdResolver(
		createHouseholdRepository(database),
		{ now: () => new Date(FIXED_DATE) }
	);
	const createId = () => `id-${idSequence++}`;

	operationService = createOperationService({
		accountRepository,
		categoryRepository: createCategoryRepository(database),
		contactRepository,
		createId,
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		now: () => new Date(FIXED_DATE),
		operationRepository: createOperationRepository(database)
	});

	transferService = createTransferService({
		accountRepository,
		contactRepository,
		createId,
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		now: () => new Date(FIXED_DATE),
		transferRepository: createTransferRepository(database)
	});
}

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	exchangeRateSequence = 1;
	idSequence = 1;

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
		baseCurrency: CurrencyCode.BYN,
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
	await database.insert(accounts).values([
		{
			archivedAt: null,
			color: AccountColor.BLUE,
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: CurrencyCode.USD,
			description: '',
			householdId: HOUSEHOLD_ID,
			id: USD_ACCOUNT_ID,
			initialBalanceMinor: 100_000,
			isColorAccentEnabled: true,
			isIncludedInFamilyTotal: true,
			name: 'USD карта',
			type: AccountType.CARD,
			updatedAt: FIXED_DATE,
			version: 1
		},
		{
			archivedAt: null,
			color: AccountColor.GREEN,
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: CurrencyCode.BYN,
			description: '',
			householdId: HOUSEHOLD_ID,
			id: BYN_ACCOUNT_ID,
			initialBalanceMinor: 200_000,
			isColorAccentEnabled: true,
			isIncludedInFamilyTotal: true,
			name: 'BYN карта',
			type: AccountType.CARD,
			updatedAt: FIXED_DATE,
			version: 1
		}
	]);
	await database.insert(contacts).values({
		archivedAt: null,
		color: AccentColor.BLUE,
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		householdId: HOUSEHOLD_ID,
		id: CONTACT_ID,
		legalName: null,
		name: 'Альфабанк',
		normalizedLegalName: null,
		normalizedName: 'альфабанк',
		type: 'company',
		updatedAt: FIXED_DATE,
		version: 1
	});

	exchangeRateService = createExchangeRateService({
		createId: () => `rate-${exchangeRateSequence++}`,
		exchangeRateRepository: createExchangeRateRepository(database),
		now: () => new Date(FIXED_DATE)
	});
	await exchangeRateService.upsert({
		effectiveOn: '2026-07-20',
		fromCurrency: CurrencyCode.USD,
		rate: '3.25',
		source: 'manual',
		toCurrency: CurrencyCode.BYN
	});
	createServices();
});

afterEach(() => {
	connection.close();
});

describe('transfer service', () => {
	it('creates a USD→BYN transfer with manual rate and linked ledger legs', async () => {
		const transfer = await transferService.create(USER_ID, {
			comment: '',
			contactId: CONTACT_ID,
			exchangeRate: '3.015',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 50_000,
			happenedOn: '2026-07-24',
			toAccountId: BYN_ACCOUNT_ID
		});

		expect(transfer.toAmountMinor).toBe(150_750);
		expect(transfer.fromOperationId).toBeTruthy();
		expect(transfer.toOperationId).toBeTruthy();
		expect(transfer.contactId).toBe(CONTACT_ID);

		const usdLedger = await operationService.getAccountLedger(USER_ID, {
			accountId: USD_ACCOUNT_ID,
			end: '2026-07-24',
			start: '2026-07-24'
		});
		const bynLedger = await operationService.getAccountLedger(USER_ID, {
			accountId: BYN_ACCOUNT_ID,
			end: '2026-07-24',
			start: '2026-07-24'
		});

		expect(usdLedger.closingBalanceMinor).toBe(50_000);
		expect(bynLedger.closingBalanceMinor).toBe(350_750);
		expect(usdLedger.items[0]?.transferId).toBe(transfer.id);
		expect(usdLedger.items[0]?.amountInHouseholdBaseCurrencyMinor).toBe(150_750);
		expect(bynLedger.items[0]?.amountInHouseholdBaseCurrencyMinor).toBe(150_750);
	});

	it('excludes transfer expenses from monthly contact summaries', async () => {
		await transferService.create(USER_ID, {
			comment: '',
			contactId: CONTACT_ID,
			exchangeRate: '3.015',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 50_000,
			happenedOn: '2026-07-24',
			toAccountId: BYN_ACCOUNT_ID
		});

		const summary = await operationService.getMonthlyExpenseSummary(USER_ID, {
			month: '2026-07'
		});

		expect(summary.contactExpensesMinor).toEqual({});
	});

	it('soft-deletes both legs and restores account balances', async () => {
		const transfer = await transferService.create(USER_ID, {
			comment: '',
			contactId: null,
			exchangeRate: '3.015',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 50_000,
			happenedOn: '2026-07-24',
			toAccountId: BYN_ACCOUNT_ID
		});

		await transferService.softDelete(USER_ID, {
			id: transfer.id,
			version: transfer.version
		});

		const balances = await operationService.getAccountBalances(USER_ID);
		const usdBalance = balances.find((item) => item.accountId === USD_ACCOUNT_ID);
		const bynBalance = balances.find((item) => item.accountId === BYN_ACCOUNT_ID);

		expect(usdBalance?.balanceMinor).toBe(100_000);
		expect(bynBalance?.balanceMinor).toBe(200_000);
	});

	it('updates amount and rate atomically on both legs', async () => {
		const transfer = await transferService.create(USER_ID, {
			comment: '',
			contactId: null,
			exchangeRate: '3.015',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 50_000,
			happenedOn: '2026-07-24',
			toAccountId: BYN_ACCOUNT_ID
		});

		const updated = await transferService.update(USER_ID, {
			comment: 'обмен',
			contactId: CONTACT_ID,
			exchangeRate: '3.1',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 40_000,
			happenedOn: '2026-07-24',
			id: transfer.id,
			toAccountId: BYN_ACCOUNT_ID,
			version: transfer.version
		});

		expect(updated.toAmountMinor).toBe(124_000);
		expect(updated.comment).toBe('обмен');
		expect(updated.contactId).toBe(CONTACT_ID);

		const balances = await operationService.getAccountBalances(USER_ID);
		const usdBalance = balances.find((item) => item.accountId === USD_ACCOUNT_ID);
		const bynBalance = balances.find((item) => item.accountId === BYN_ACCOUNT_ID);

		expect(usdBalance?.balanceMinor).toBe(60_000);
		expect(bynBalance?.balanceMinor).toBe(324_000);
	});

	it('rejects same-currency transfers', async () => {
		await database.insert(accounts).values({
			archivedAt: null,
			color: AccountColor.AMBER,
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: CurrencyCode.USD,
			description: '',
			householdId: HOUSEHOLD_ID,
			id: 'account-usd-2',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'USD cash',
			type: AccountType.CASH,
			updatedAt: FIXED_DATE,
			version: 1
		});

		await expect(transferService.create(USER_ID, {
			comment: '',
			contactId: null,
			exchangeRate: '1',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 1_000,
			happenedOn: '2026-07-24',
			toAccountId: 'account-usd-2'
		})).rejects.toBeInstanceOf(TransferAccountsInvalidError);
	});

	it('blocks direct update and delete of transfer-linked operations', async () => {
		const transfer = await transferService.create(USER_ID, {
			comment: '',
			contactId: null,
			exchangeRate: '3.015',
			fromAccountId: USD_ACCOUNT_ID,
			fromAmountMinor: 50_000,
			happenedOn: '2026-07-24',
			toAccountId: BYN_ACCOUNT_ID
		});
		const ledger = await operationService.getAccountLedger(USER_ID, {
			accountId: USD_ACCOUNT_ID,
			end: '2026-07-24',
			start: '2026-07-24'
		});
		expect(ledger.items.length).toBeGreaterThan(0);
		const [operation] = ledger.items;

		expect(operation.transferId).toBe(transfer.id);

		await expect(operationService.update(USER_ID, {
			amountMinor: 10_000,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-07-24',
			id: operation.id,
			title: 'hack',
			type: 'expense',
			version: operation.version
		})).rejects.toBeInstanceOf(OperationTransferLinkedError);

		await expect(operationService.softDelete(USER_ID, {
			id: operation.id,
			version: operation.version
		})).rejects.toBeInstanceOf(OperationTransferLinkedError);
	});
});
