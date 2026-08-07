import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from '../src/app';
import { CategoryHttpController } from '../src/http/category-controller';
import type { RequestSessionResolver } from '../src/http/session-resolver';
import type { AppDatabase } from '../src/infrastructure/database/client';
import * as schema from '../src/infrastructure/database/schema';
import { categories, categoryKeywords, households, users } from '../src/infrastructure/database/schema';
import type { AuthenticatedSession } from '../src/modules/auth';
import { CategoryRepository, CategoryService } from '../src/modules/category';
import { HouseholdRepository, HouseholdResolver } from '../src/modules/household';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'default-household';
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
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await database.insert(categories).values({
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
	});
	await database.insert(categoryKeywords).values({
		categoryId: 'category-food',
		normalizedValue: 'магазин',
		position: 0,
		value: 'магазин'
	});
});

afterEach(() => {
	connection.close();
});

function createController(sessionResolver: RequestSessionResolver): CategoryHttpController {
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);
	const categoryService = new CategoryService({
		categoryRepository: new CategoryRepository(database),
		householdResolver,
		createId: () => 'category-new',
		now: () => FIXED_DATE
	});

	return new CategoryHttpController(categoryService, sessionResolver);
}

const noSessionResolver: RequestSessionResolver = {
	resolve: async () => null
};

const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-08-24T10:00:00.000Z'),
	id: 'session-1',
	user: {
		displayName: 'Sergei Test',
		id: USER_ID,
		username: 'sergei'
	}
};

const sessionResolver: RequestSessionResolver = {
	resolve: async () => authenticatedSession
};

describe('Categories HTTP controller', () => {
	it('keeps the public categories contract and cache boundary', async () => {
		const app = createApiApp({
			categoryController: createController(noSessionResolver)
		});
		const response = await app.request('/api/public/categories');

		expect(response.status).toBe(200);
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(await response.json()).toEqual([
			{
				color: '#3f77a8',
				description: 'Продукты для домашних завтраков и ужинов.',
				id: 'category-food',
				keywords: ['магазин'],
				name: 'Продукты'
			}
		]);
	});

	it('does not expose protected category reads without a session', async () => {
		const app = createApiApp({
			categoryController: createController(noSessionResolver)
		});
		const response = await app.request('/api/categories');

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		});
	});

	it('passes authenticated commands through the service boundary', async () => {
		const app = createApiApp({
			categoryController: createController(sessionResolver)
		});
		const response = await app.request('/api/categories', {
			body: JSON.stringify({
				color: '#68a063',
				description: '',
				keywords: ['рынок'],
				monthlyBudgetMinor: null,
				name: 'Новая категория'
			}),
			headers: {
				'content-type': 'application/json',
				origin: 'http://localhost:5173'
			},
			method: 'POST'
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			category: {
				id: 'category-new',
				keywords: ['рынок'],
				name: 'Новая категория',
				version: 1
			},
			ok: true
		});
	});
});
