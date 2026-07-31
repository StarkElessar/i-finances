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

import { handlePublicCategoriesRequest } from '~/entities/category/api/public-categories.server';
import { createCategoryRepository } from '~/server/category/category-repository';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    categories,
    categoryKeywords,
    households,
    users
} from '~/server/db/schema';
import { CurrencyCode } from '~/shared/lib';

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
            baseCurrency: CurrencyCode.BYN,
            createdAt: FIXED_DATE,
            id: HOUSEHOLD_ID,
            name: 'Семья',
            updatedAt: FIXED_DATE
        },
        {
            baseCurrency: CurrencyCode.USD,
            createdAt: FIXED_DATE,
            id: OTHER_HOUSEHOLD_ID,
            name: 'Другая семья',
            updatedAt: FIXED_DATE
        }
    ]);
    await database.insert(categories).values([
        {
            archivedAt: null,
            color: '#3f77a8',
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            description: 'Продукты для домашних завтраков и ужинов.',
            householdId: HOUSEHOLD_ID,
            id: 'category-food',
            monthlyBudgetMinor: 500_000,
            name: 'Продукты',
            normalizedName: 'продукты',
            updatedAt: FIXED_DATE,
            version: 1
        },
        {
            archivedAt: FIXED_DATE,
            color: '#d95959',
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            householdId: HOUSEHOLD_ID,
            id: 'category-archived',
            monthlyBudgetMinor: null,
            name: 'Архив',
            normalizedName: 'архив',
            updatedAt: FIXED_DATE,
            version: 1
        },
        {
            archivedAt: null,
            color: '#68a063',
            createdAt: FIXED_DATE,
            createdByUserId: USER_ID,
            householdId: OTHER_HOUSEHOLD_ID,
            id: 'category-other',
            monthlyBudgetMinor: null,
            name: 'Чужая категория',
            normalizedName: 'чужая категория',
            updatedAt: FIXED_DATE,
            version: 1
        }
    ]);
    await database.insert(categoryKeywords).values([
        {
            categoryId: 'category-food',
            normalizedValue: 'магазин',
            position: 0,
            value: 'магазин'
        },
        {
            categoryId: 'category-food',
            normalizedValue: 'еда',
            position: 1,
            value: 'еда'
        },
        {
            categoryId: 'category-archived',
            normalizedValue: 'старое',
            position: 0,
            value: 'старое'
        }
    ]);
});

afterEach(() => {
    connection.close();
});

describe('public categories API', () => {
    it('returns active categories for the configured household only', async () => {
        const response = await handlePublicCategoriesRequest({
            categoryRepository: createCategoryRepository(database),
            householdId: HOUSEHOLD_ID
        });

        await expect(response.json()).resolves.toEqual([
            {
                color: '#3f77a8',
                description: 'Продукты для домашних завтраков и ужинов.',
                id: 'category-food',
                keywords: ['магазин', 'еда'],
                name: 'Продукты'
            }
        ]);
        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    });
});
