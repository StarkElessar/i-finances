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
import { createAccountRepository } from '~/server/account/account-repository';
import {
    AccountNotFoundError,
    type AccountService,
    AccountVersionConflictError,
    createAccountService
} from '~/server/account/account-service';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    householdMembers,
    households,
    users
} from '~/server/db/schema';
import { DEFAULT_HOUSEHOLD_ID } from '~/server/household/default-household';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
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

/**
 * Creates the service under test from repositories backed by the memory DB.
 */
function createTestAccountService(): AccountService {
    return createAccountService({
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
