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
    createCategoryInputSchema,
    updateCategoryInputSchema
} from '~/entities/category';
import {
    CategoryNameConflictError,
    CategoryNotFoundError,
    CategoryVersionConflictError
} from '~/server/category/category-errors';
import { createCategoryRepository } from '~/server/category/category-repository';
import {
    type CategoryService,
    createCategoryService
} from '~/server/category/category-service';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    householdMembers,
    households,
    users
} from '~/server/db/schema';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { AccentColor, CurrencyCode } from '~/shared/lib';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

const validCreateInput = createCategoryInputSchema.parse({
    color: AccentColor.BLUE,
    keywords: ['аптека', 'лекарства'],
    monthlyBudgetMinor: 150_000,
    name: 'Здоровье'
});

let connection: Database.Database;
let database: AppDatabase;
let categoryService: CategoryService;
let categorySequence: number;

/**
 * Creates the service under test from repositories backed by the memory DB.
 */
function createTestCategoryService(): CategoryService {
    return createCategoryService({
        categoryRepository: createCategoryRepository(database),
        createId: () => `category-${categorySequence++}`,
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
    categorySequence = 1;

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

    categoryService = createTestCategoryService();
});

afterEach(() => {
    connection.close();
});

describe('category service persistence', () => {
    it('creates and lists an active category in the household base currency', async () => {
        const created = await categoryService.create(USER_ID, validCreateInput);
        const collection = await categoryService.list(USER_ID, 'active');

        expect(created).toMatchObject({
            archivedAt: null,
            id: 'category-1',
            keywords: ['аптека', 'лекарства'],
            monthlyBudgetMinor: 150_000,
            name: 'Здоровье',
            version: 1
        });
        expect(collection).toEqual({
            baseCurrency: CurrencyCode.BYN,
            items: [created]
        });
    });

    it('replaces keywords atomically and rejects a stale version', async () => {
        const created = await categoryService.create(USER_ID, validCreateInput);
        const updateInput = updateCategoryInputSchema.parse({
            ...validCreateInput,
            color: AccentColor.GREEN,
            id: created.id,
            keywords: ['клиника', 'врач'],
            name: 'Медицина',
            version: created.version
        });
        const updated = await categoryService.update(USER_ID, updateInput);

        expect(updated).toMatchObject({
            color: AccentColor.GREEN,
            keywords: ['клиника', 'врач'],
            name: 'Медицина',
            version: 2
        });
        await expect(categoryService.update(USER_ID, updateInput))
            .rejects
            .toBeInstanceOf(CategoryVersionConflictError);
    });

    it('archives, filters and restores a category', async () => {
        const created = await categoryService.create(USER_ID, validCreateInput);
        const archived = await categoryService.archive(USER_ID, {
            id: created.id,
            version: created.version
        });

        expect(archived.archivedAt).toBe(FIXED_DATE.toISOString());
        await expect(categoryService.list(USER_ID, 'active'))
            .resolves
            .toMatchObject({ items: [] });
        await expect(categoryService.list(USER_ID, 'archived'))
            .resolves
            .toMatchObject({ items: [archived] });

        const restored = await categoryService.restore(USER_ID, {
            id: archived.id,
            version: archived.version
        });

        expect(restored).toMatchObject({
            archivedAt: null,
            version: 3
        });
    });

    it('rejects duplicate normalized names and keywords', async () => {
        await categoryService.create(USER_ID, validCreateInput);

        await expect(categoryService.create(USER_ID, {
            ...validCreateInput,
            name: '  здоровье  '
        })).rejects.toBeInstanceOf(CategoryNameConflictError);

        expect(createCategoryInputSchema.safeParse({
            ...validCreateInput,
            keywords: ['ёлка', 'елка']
        }).success).toBe(false);
    });

    it('accepts keywords without an artificial length limit', () => {
        const longKeyword = 'магазин с очень подробным названием без ограничения длины';
        const parsedInput = createCategoryInputSchema.parse({
            ...validCreateInput,
            keywords: [longKeyword]
        });

        expect(parsedInput.keywords).toEqual([longKeyword]);
    });

    it('does not expose a category owned by another household', async () => {
        await database.insert(users).values({
            createdAt: FIXED_DATE,
            displayName: 'Other User',
            id: 'user-2',
            isActive: true,
            passwordHash: 'hash',
            updatedAt: FIXED_DATE,
            username: 'other'
        });
        await database.insert(households).values({
            baseCurrency: CurrencyCode.USD,
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

        const otherCategory = await categoryService.create(
            'user-2',
            validCreateInput
        );

        await expect(categoryService.update(
            USER_ID,
            updateCategoryInputSchema.parse({
                ...validCreateInput,
                id: otherCategory.id,
                version: otherCategory.version
            })
        )).rejects.toBeInstanceOf(CategoryNotFoundError);
    });
});
