import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    accounts,
    categories,
    contacts,
    householdMembers,
    households,
    users
} from '~/server/db/schema';
import { createAccountRepository } from '~/server/account/account-repository';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createContactRepository } from '~/server/contact/contact-repository';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import {
    createExchangeRateService,
    type ExchangeRateService
} from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import {
    OperationReferenceUnavailableError,
    OperationVersionConflictError
} from '~/server/operation/operation-errors';
import { createOperationRepository } from '~/server/operation/operation-repository';
import {
    createOperationService,
    type OperationService
} from '~/server/operation/operation-service';
import {
    AccountColor,
    AccountType,
    AccentColor,
    CurrencyCode
} from '~/shared/lib';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const ACCOUNT_ID = 'account-usd';
const CATEGORY_ID = 'category-food';
const CONTACT_ID = 'contact-shop';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let exchangeRateSequence: number;
let exchangeRateService: ExchangeRateService;
let operationSequence: number;
let operationService: OperationService;

function createTestOperationService(): OperationService {
    return createOperationService({
        accountRepository: createAccountRepository(database),
        categoryRepository: createCategoryRepository(database),
        contactRepository: createContactRepository(database),
        createId: () => `operation-${operationSequence++}`,
        exchangeRateResolver: exchangeRateService,
        householdResolver: createHouseholdResolver(
            createHouseholdRepository(database),
            { now: () => new Date(FIXED_DATE) }
        ),
        now: () => new Date(FIXED_DATE),
        operationRepository: createOperationRepository(database)
    });
}

async function createOperation(
    overrides: Partial<Parameters<OperationService['create']>[1]> = {}
) {
    return operationService.create(USER_ID, {
        accountId: ACCOUNT_ID,
        amountMinor: 1_000,
        categoryId: CATEGORY_ID,
        comment: '',
        contactId: CONTACT_ID,
        happenedOn: '2026-07-24',
        title: 'Продукты',
        type: 'expense',
        ...overrides
    });
}

beforeEach(async () => {
    connection = new Database(':memory:');
    connection.pragma('foreign_keys = ON');
    database = drizzle(connection, { schema });
    migrate(database, { migrationsFolder: './drizzle' });
    exchangeRateSequence = 1;
    operationSequence = 1;

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
    await database.insert(accounts).values({
        archivedAt: null,
        color: AccountColor.BLUE,
        createdAt: FIXED_DATE,
        createdByUserId: USER_ID,
        currency: CurrencyCode.USD,
        description: '',
        householdId: HOUSEHOLD_ID,
        id: ACCOUNT_ID,
        initialBalanceMinor: 10_000,
        isColorAccentEnabled: true,
        isIncludedInFamilyTotal: true,
        name: 'Долларовая карта',
        type: AccountType.CARD,
        updatedAt: FIXED_DATE,
        version: 1
    });
    await database.insert(categories).values({
        archivedAt: null,
        color: AccentColor.GREEN,
        createdAt: FIXED_DATE,
        createdByUserId: USER_ID,
        householdId: HOUSEHOLD_ID,
        id: CATEGORY_ID,
        monthlyBudgetMinor: 100_000,
        name: 'Продукты',
        normalizedName: 'продукты',
        updatedAt: FIXED_DATE,
        version: 1
    });
    await database.insert(contacts).values({
        archivedAt: null,
        color: AccentColor.BLUE,
        createdAt: FIXED_DATE,
        createdByUserId: USER_ID,
        householdId: HOUSEHOLD_ID,
        id: CONTACT_ID,
        legalName: 'ООО Магазин',
        name: 'Магазин',
        normalizedLegalName: 'ооо магазин',
        normalizedName: 'магазин',
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
    operationService = createTestOperationService();
});

afterEach(() => {
    connection.close();
});

describe('operation service persistence', () => {
    it('creates a converted operation and calculates ledger balances', async () => {
        const created = await createOperation();
        const ledger = await operationService.getAccountLedger(USER_ID, {
            accountId: ACCOUNT_ID,
            end: '2026-07-31',
            start: '2026-07-01'
        });
        const balances = await operationService.getAccountBalances(USER_ID);

        expect(created).toMatchObject({
            amountInHouseholdBaseCurrencyMinor: 3_250,
            currency: CurrencyCode.USD,
            exchangeRate: {
                effectiveOn: '2026-07-20',
                rate: '3.25',
                source: 'manual'
            },
            householdBaseCurrency: CurrencyCode.BYN,
            sourceOrder: -1,
            version: 1
        });
        expect(ledger).toMatchObject({
            closingBalanceMinor: 9_000,
            openingBalanceMinor: 10_000
        });
        expect(ledger.items[0]).toMatchObject({
            balanceAfterMinor: 9_000,
            signedAmountMinor: -1_000
        });
        expect(balances).toEqual([{
            accountId: ACCOUNT_ID,
            balanceMinor: 9_000,
            currency: CurrencyCode.USD
        }]);
    });

    it('places each new operation first inside its day', async () => {
        const first = await createOperation({ title: 'Первая' });
        const second = await createOperation({ title: 'Вторая' });
        const ledger = await operationService.getAccountLedger(USER_ID, {
            accountId: ACCOUNT_ID,
            end: '2026-07-24',
            start: '2026-07-24'
        });

        expect(first.sourceOrder).toBe(-1);
        expect(second.sourceOrder).toBe(-2);
        expect(ledger.items.map((operation) => operation.title))
            .toEqual(['Вторая', 'Первая']);
    });

    it('preserves a stored rate unless the date changes', async () => {
        const created = await createOperation();

        await exchangeRateService.upsert({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '3.4',
            source: 'corrected',
            toCurrency: CurrencyCode.BYN
        });

        const sameDate = await operationService.update(USER_ID, {
            amountMinor: 2_000,
            categoryId: created.categoryId,
            comment: 'Исправленная сумма',
            contactId: created.contactId,
            happenedOn: created.happenedOn,
            id: created.id,
            title: created.title,
            type: created.type,
            version: created.version
        });
        const newDate = await operationService.update(USER_ID, {
            amountMinor: sameDate.amountMinor,
            categoryId: sameDate.categoryId,
            comment: sameDate.comment,
            contactId: sameDate.contactId,
            happenedOn: '2026-07-25',
            id: sameDate.id,
            title: sameDate.title,
            type: sameDate.type,
            version: sameDate.version
        });

        expect(sameDate.exchangeRate.rate).toBe('3.25');
        expect(sameDate.amountInHouseholdBaseCurrencyMinor).toBe(6_500);
        expect(newDate.exchangeRate).toMatchObject({
            effectiveOn: '2026-07-24',
            rate: '3.4'
        });
        expect(newDate.amountInHouseholdBaseCurrencyMinor).toBe(6_800);
    });

    it('uses live reference names and snapshots as a deletion fallback', async () => {
        const created = await createOperation();

        await database.update(categories)
            .set({ name: 'Еда', normalizedName: 'еда' })
            .where(eq(categories.id, CATEGORY_ID));

        const withLiveName = await operationService.getAccountLedger(USER_ID, {
            accountId: ACCOUNT_ID,
            end: '2026-07-31',
            start: '2026-07-01'
        });

        expect(withLiveName.items[0]?.categoryName).toBe('Еда');

        await database.delete(categories).where(eq(categories.id, CATEGORY_ID));

        const withSnapshot = await operationService.getAccountLedger(USER_ID, {
            accountId: ACCOUNT_ID,
            end: '2026-07-31',
            start: '2026-07-01'
        });

        expect(withSnapshot.items[0]).toMatchObject({
            categoryId: null,
            categoryName: created.categoryName
        });
    });

    it('keeps current archived references but rejects selecting another one', async () => {
        const created = await createOperation();

        await database.update(categories)
            .set({ archivedAt: FIXED_DATE })
            .where(eq(categories.id, CATEGORY_ID));
        await database.insert(categories).values({
            archivedAt: FIXED_DATE,
            color: AccentColor.ROSE,
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            householdId: HOUSEHOLD_ID,
            id: 'category-archived',
            monthlyBudgetMinor: null,
            name: 'Архив',
            normalizedName: 'архив',
            updatedAt: FIXED_DATE,
            version: 1
        });

        await expect(operationService.update(USER_ID, {
            amountMinor: created.amountMinor,
            categoryId: created.categoryId,
            comment: created.comment,
            contactId: created.contactId,
            happenedOn: created.happenedOn,
            id: created.id,
            title: created.title,
            type: created.type,
            version: created.version
        })).resolves.toMatchObject({ categoryId: CATEGORY_ID });

        await expect(operationService.update(USER_ID, {
            amountMinor: created.amountMinor,
            categoryId: 'category-archived',
            comment: created.comment,
            contactId: created.contactId,
            happenedOn: created.happenedOn,
            id: created.id,
            title: created.title,
            type: created.type,
            version: created.version + 1
        })).rejects.toBeInstanceOf(OperationReferenceUnavailableError);
    });

    it('soft deletes, restores and protects commands with a version', async () => {
        const created = await createOperation();
        const deleted = await operationService.softDelete(USER_ID, {
            id: created.id,
            version: created.version
        });
        const balancesAfterDelete = await operationService.getAccountBalances(
            USER_ID
        );

        expect(deleted).toMatchObject({
            deletedAt: FIXED_DATE.toISOString(),
            deletedByUserId: USER_ID,
            version: 2
        });
        expect(balancesAfterDelete[0]?.balanceMinor).toBe(10_000);
        await expect(operationService.restore(USER_ID, {
            id: deleted.id,
            version: created.version
        })).rejects.toBeInstanceOf(OperationVersionConflictError);

        const restored = await operationService.restore(USER_ID, {
            id: deleted.id,
            version: deleted.version
        });

        expect(restored).toMatchObject({
            deletedAt: null,
            deletedByUserId: null,
            version: 3
        });
    });

    it('returns base-currency monthly expenses by category and contact', async () => {
        await createOperation();
        await createOperation({
            amountMinor: 500,
            happenedOn: '2026-07-23'
        });
        await exchangeRateService.upsert({
            effectiveOn: '2026-06-01',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });
        await createOperation({
            amountMinor: 400,
            happenedOn: '2026-06-30'
        });
        await createOperation({
            amountMinor: 700,
            type: 'income'
        });

        const summary = await operationService.getMonthlyExpenseSummary(
            USER_ID,
            { month: '2026-07' }
        );

        expect(summary).toEqual({
            baseCurrency: CurrencyCode.BYN,
            categoryExpensesMinor: {
                [CATEGORY_ID]: 4_875
            },
            contactExpensesMinor: {
                [CONTACT_ID]: 4_875
            },
            month: '2026-07'
        });
    });

    it('lists category operations for a date range with account names', async () => {
        await createOperation({
            amountMinor: 400,
            happenedOn: '2026-08-05',
            title: 'Вне периода'
        });
        await createOperation({
            amountMinor: 700,
            happenedOn: '2026-07-24',
            title: 'Ранняя'
        });
        await createOperation({
            amountMinor: 1_200,
            happenedOn: '2026-07-24',
            title: 'Поздняя'
        });
        await createOperation({
            amountMinor: 500,
            categoryId: null,
            happenedOn: '2026-07-24',
            title: 'Без категории'
        });

        const result = await operationService.getCategoryOperations(USER_ID, {
            categoryId: CATEGORY_ID,
            end: '2026-07-31',
            start: '2026-07-01'
        });

        expect(result).toMatchObject({
            categoryId: CATEGORY_ID,
            householdBaseCurrency: CurrencyCode.BYN,
            range: {
                end: '2026-07-31',
                start: '2026-07-01'
            }
        });
        expect(result.items.map((item) => item.title)).toEqual([
            'Поздняя',
            'Ранняя'
        ]);
        expect(result.items[0]).toMatchObject({
            accountName: 'Долларовая карта',
            amountInHouseholdBaseCurrencyMinor: 3_900,
            amountMinor: 1_200,
            categoryId: CATEGORY_ID,
            type: 'expense'
        });
    });

    it('lists contact operations for a date range with account names', async () => {
        await createOperation({
            amountMinor: 400,
            happenedOn: '2026-08-05',
            title: 'Вне периода'
        });
        await createOperation({
            amountMinor: 700,
            happenedOn: '2026-07-24',
            title: 'Ранняя'
        });
        await createOperation({
            amountMinor: 1_200,
            happenedOn: '2026-07-24',
            title: 'Поздняя'
        });
        await createOperation({
            amountMinor: 500,
            contactId: null,
            happenedOn: '2026-07-24',
            title: 'Без контакта'
        });

        const result = await operationService.getContactOperations(USER_ID, {
            contactId: CONTACT_ID,
            end: '2026-07-31',
            start: '2026-07-01'
        });

        expect(result).toMatchObject({
            contactId: CONTACT_ID,
            householdBaseCurrency: CurrencyCode.BYN,
            range: {
                end: '2026-07-31',
                start: '2026-07-01'
            }
        });
        expect(result.items.map((item) => item.title)).toEqual([
            'Поздняя',
            'Ранняя'
        ]);
        expect(result.items[0]).toMatchObject({
            accountName: 'Долларовая карта',
            amountInHouseholdBaseCurrencyMinor: 3_900,
            amountMinor: 1_200,
            contactId: CONTACT_ID,
            type: 'expense'
        });
    });

    it('recalculates an existing operation only on explicit request', async () => {
        const created = await createOperation();

        await exchangeRateService.upsert({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '3.5',
            source: 'corrected',
            toCurrency: CurrencyCode.BYN
        });

        const recalculated = await operationService.recalculateRate(USER_ID, {
            id: created.id,
            version: created.version
        });

        expect(recalculated).toMatchObject({
            amountInHouseholdBaseCurrencyMinor: 3_500,
            exchangeRate: {
                rate: '3.5',
                source: 'corrected'
            },
            version: 2
        });
    });
});
