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

import {
    createAccountInputSchema,
    updateAccountInputSchema
} from '~/entities/account';
import {
    AccountCurrencyCorrectionRequiredError,
    AccountNotFoundError,
    AccountVersionConflictError
} from '~/server/account/account-errors';
import { createAccountRepository } from '~/server/account/account-repository';
import {
    type AccountService,
    createAccountService
} from '~/server/account/account-service';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    householdMembers,
    households,
    operations,
    users
} from '~/server/db/schema';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import {
    createExchangeRateService,
    type ExchangeRateService
} from '~/server/exchange-rate/exchange-rate-service';
import { ExchangeRateNotFoundError } from '~/server/exchange-rate/exchange-rate-errors';
import { DEFAULT_HOUSEHOLD_ID } from '~/server/household/default-household';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { createOperationAccountCurrencyCorrector } from '~/server/operation/account-currency-corrector';
import {
    AccountColor,
    AccountType,
    CurrencyCode
} from '~/shared/lib';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

const validCreateInput = createAccountInputSchema.parse({
    color: AccountColor.BLUE,
    currency: CurrencyCode.BYN,
    description: 'Семья',
    initialBalanceMinor: -773,
    isColorAccentEnabled: true,
    isIncludedInFamilyTotal: true,
    name: 'Наличные',
    type: AccountType.CASH
});

let connection: Database.Database;
let database: AppDatabase;
let accountService: AccountService;
let exchangeRateSequence: number;
let exchangeRateService: ExchangeRateService;

/**
 * Creates the service under test from repositories backed by the memory DB.
 */
function createTestAccountService(): AccountService {
    return createAccountService({
        accountCurrencyCorrector: createOperationAccountCurrencyCorrector({
            database,
            exchangeRateResolver: exchangeRateService
        }),
        accountRepository: createAccountRepository(database),
        createId: () => 'account-1',
        householdResolver: createHouseholdResolver(
            createHouseholdRepository(database),
            { now: () => new Date(FIXED_DATE) }
        ),
        now: () => new Date(FIXED_DATE)
    });
}

beforeEach(async () => {
    connection = new Database(':memory:');
    connection.pragma('foreign_keys = ON');
    database = drizzle(connection, { schema });
    migrate(database, { migrationsFolder: './drizzle' });
    exchangeRateSequence = 1;

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

    exchangeRateService = createExchangeRateService({
        createId: () => `rate-${exchangeRateSequence++}`,
        exchangeRateRepository: createExchangeRateRepository(database),
        now: () => new Date(FIXED_DATE)
    });
    accountService = createTestAccountService();
});

afterEach(() => {
    connection.close();
});

describe('account service persistence', () => {
    it('creates and lists an active household account', async () => {
        const created = await accountService.create(USER_ID, validCreateInput);
        const accounts = await accountService.list(USER_ID, false);

        expect(created).toMatchObject({
            archivedAt: null,
            id: 'account-1',
            initialBalanceMinor: -773,
            name: 'Наличные',
            version: 1
        });
        expect(accounts).toEqual([created]);
    });

    it('updates an account and rejects a stale version', async () => {
        const created = await accountService.create(USER_ID, validCreateInput);
        const updateInput = updateAccountInputSchema.parse({
            ...validCreateInput,
            color: AccountColor.GREEN,
            id: created.id,
            name: 'Основные наличные',
            version: created.version
        });
        const updated = await accountService.update(USER_ID, updateInput);

        expect(updated).toMatchObject({
            color: AccountColor.GREEN,
            name: 'Основные наличные',
            version: 2
        });
        await expect(accountService.update(USER_ID, updateInput))
            .rejects
            .toBeInstanceOf(AccountVersionConflictError);
    });

    it('requires confirmation and atomically corrects populated account currency', async () => {
        const created = await accountService.create(USER_ID, validCreateInput);

        await database.insert(operations).values({
            accountId: created.id,
            amountInHouseholdBaseCurrencyMinor: 1_000,
            amountMinor: 1_000,
            categoryId: null,
            categoryNameSnapshot: null,
            comment: '',
            contactId: null,
            contactNameSnapshot: null,
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            currency: CurrencyCode.BYN,
            deletedAt: FIXED_DATE,
            deletedByUserId: USER_ID,
            exchangeRate: '1',
            exchangeRateEffectiveOn: '2026-07-20',
            exchangeRateSource: 'identity',
            happenedOn: '2026-07-20',
            householdBaseCurrency: CurrencyCode.BYN,
            householdId: HOUSEHOLD_ID,
            id: 'operation-1',
            sourceOrder: -1,
            title: 'Историческая операция',
            type: 'expense',
            updatedAt: FIXED_DATE,
            updatedByUserId: USER_ID,
            version: 1
        });
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-20',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        const updateInput = updateAccountInputSchema.parse({
            ...validCreateInput,
            currency: CurrencyCode.USD,
            id: created.id,
            version: created.version
        });

        await expect(accountService.update(USER_ID, updateInput))
            .rejects
            .toBeInstanceOf(AccountCurrencyCorrectionRequiredError);

        const corrected = await accountService.update(USER_ID, {
            ...updateInput,
            confirmCurrencyCorrection: true
        });
        const [correctedOperation] = await database.select().from(operations);

        expect(corrected).toMatchObject({
            currency: CurrencyCode.USD,
            version: 2
        });
        expect(correctedOperation).toMatchObject({
            amountInHouseholdBaseCurrencyMinor: 3_250,
            amountMinor: 1_000,
            currency: CurrencyCode.USD,
            deletedAt: FIXED_DATE,
            exchangeRate: '3.25',
            version: 2
        });
    });

    it('rolls back a currency correction when a historical rate is missing', async () => {
        const created = await accountService.create(USER_ID, validCreateInput);

        await database.insert(operations).values({
            accountId: created.id,
            amountInHouseholdBaseCurrencyMinor: 1_000,
            amountMinor: 1_000,
            categoryId: null,
            categoryNameSnapshot: null,
            comment: '',
            contactId: null,
            contactNameSnapshot: null,
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            currency: CurrencyCode.BYN,
            deletedAt: null,
            deletedByUserId: null,
            exchangeRate: '1',
            exchangeRateEffectiveOn: '2026-07-20',
            exchangeRateSource: 'identity',
            happenedOn: '2026-07-20',
            householdBaseCurrency: CurrencyCode.BYN,
            householdId: HOUSEHOLD_ID,
            id: 'operation-without-rate',
            sourceOrder: -1,
            title: 'Без курса',
            type: 'expense',
            updatedAt: FIXED_DATE,
            updatedByUserId: USER_ID,
            version: 1
        });
        const updateInput = updateAccountInputSchema.parse({
            ...validCreateInput,
            confirmCurrencyCorrection: true,
            currency: CurrencyCode.EUR,
            id: created.id,
            version: created.version
        });

        await expect(accountService.update(USER_ID, updateInput))
            .rejects
            .toBeInstanceOf(ExchangeRateNotFoundError);
        await expect(createAccountRepository(database).findById(
            HOUSEHOLD_ID,
            created.id
        )).resolves.toMatchObject({
            currency: CurrencyCode.BYN,
            version: 1
        });
    });

    it('archives, includes and restores an account', async () => {
        const created = await accountService.create(USER_ID, validCreateInput);
        const archived = await accountService.archive(USER_ID, {
            id: created.id,
            version: created.version
        });

        expect(archived.archivedAt).toBe(FIXED_DATE.toISOString());
        await expect(accountService.list(USER_ID, false)).resolves.toEqual([]);
        await expect(accountService.list(USER_ID, true)).resolves.toEqual([archived]);

        const restored = await accountService.restore(USER_ID, {
            id: archived.id,
            version: archived.version
        });

        expect(restored).toMatchObject({
            archivedAt: null,
            version: 3
        });
        await expect(accountService.list(USER_ID, false)).resolves.toEqual([restored]);
    });

    it('attaches old auth users to the default household on first access', async () => {
        await database.insert(users).values({
            createdAt: FIXED_DATE,
            displayName: 'Outside User',
            id: 'user-2',
            isActive: true,
            passwordHash: 'hash',
            updatedAt: FIXED_DATE,
            username: 'outside'
        });

        await expect(accountService.list('user-2', false)).resolves.toEqual([]);

        const memberships = await createHouseholdRepository(database)
            .findForUser('user-2');

        expect(memberships).toEqual([{
            baseCurrency: CurrencyCode.BYN,
            id: DEFAULT_HOUSEHOLD_ID
        }]);
    });

    it('does not expose an account owned by another household', async () => {
        await database.insert(users).values({
            createdAt: FIXED_DATE,
            displayName: 'Other Household User',
            id: 'user-2',
            isActive: true,
            passwordHash: 'hash',
            updatedAt: FIXED_DATE,
            username: 'other'
        });
        await database.insert(households).values({
            baseCurrency: CurrencyCode.BYN,
            createdAt: FIXED_DATE,
            id: 'household-2',
            name: 'Другая семья',
            updatedAt: FIXED_DATE
        });
        await database.insert(householdMembers).values({
            householdId: 'household-2',
            joinedAt: FIXED_DATE,
            role: 'owner',
            userId: 'user-2'
        });

        const otherAccount = await accountService.create(
            'user-2',
            validCreateInput
        );
        const crossHouseholdUpdate = updateAccountInputSchema.parse({
            ...validCreateInput,
            id: otherAccount.id,
            name: 'Попытка изменить чужой счёт',
            version: otherAccount.version
        });

        await expect(accountService.update(USER_ID, crossHouseholdUpdate))
            .rejects
            .toBeInstanceOf(AccountNotFoundError);
    });
});

describe('account contracts', () => {
    it('rejects malformed account values before the service call', () => {
        const result = createAccountInputSchema.safeParse({
            ...validCreateInput,
            color: 'blue',
            name: ''
        });

        expect(result.success).toBe(false);
    });
});
