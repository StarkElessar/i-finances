import {
	categoryListInputSchema,
	createCategoryInputSchema,
	updateCategoryInputSchema
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

import type { AppDatabase } from '../src/infrastructure/database/client';
import * as schema from '../src/infrastructure/database/schema';
import { categories, categoryKeywords, householdMembers, households, users } from '../src/infrastructure/database/schema';
import {
	CategoryNameConflictError,
	CategoryRepository,
	CategoryService,
	CategoryVersionConflictError
} from '../src/modules/category';
import { HouseholdRepository, HouseholdResolver } from '../src/modules/household';

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

function createService(): CategoryService {
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);

	return new CategoryService({
		categoryRepository: new CategoryRepository(database),
		createId: () => 'category-food',
		householdResolver,
		now: () => FIXED_DATE
	});
}

describe('CategoryService', () => {
	it('creates and lists normalized categories in the active household', async () => {
		const service = createService();
		const input = createCategoryInputSchema.parse({
			color: '#3f77a8',
			description: '  Домашние завтраки.  ',
			keywords: [' Магазин ', 'Еда'],
			monthlyBudgetMinor: 500_000,
			name: '  Продукты   для дома '
		});

		const created = await service.create(USER_ID, input);
		const listInput = categoryListInputSchema.parse({});
		const collection = await service.list(USER_ID, listInput.status);

		expect(created).toMatchObject({
			archivedAt: null,
			description: 'Домашние завтраки.',
			keywords: ['магазин', 'еда'],
			name: 'Продукты для дома',
			version: 1
		});
		expect(collection.baseCurrency).toBe('BYN');
		expect(collection.items).toEqual([created]);
	});

	it('replaces keywords atomically and rejects stale optimistic-lock updates', async () => {
		const service = createService();
		const created = await service.create(USER_ID, createCategoryInputSchema.parse({
			color: '#3f77a8',
			description: '',
			keywords: ['магазин', 'еда'],
			monthlyBudgetMinor: null,
			name: 'Продукты'
		}));

		const update = updateCategoryInputSchema.parse({
			...created,
			color: '#68a063',
			description: 'Обновлено',
			keywords: ['рынок'],
			name: 'Продукты',
			version: created.version
		});
		const updated = await service.update(USER_ID, update);

		expect(updated).toMatchObject({
			color: '#68a063',
			description: 'Обновлено',
			keywords: ['рынок'],
			version: 2
		});
		expect(await database.select().from(categoryKeywords)).toMatchObject([
			{
				categoryId: 'category-food',
				normalizedValue: 'рынок',
				position: 0,
				value: 'рынок'
			}
		]);

		await expect(service.update(USER_ID, {
			...update,
			color: '#d95959',
			version: 1
		})).rejects.toBeInstanceOf(CategoryVersionConflictError);
	});

	it('rejects normalized duplicate category names', async () => {
		const service = createService();
		const input = {
			color: '#3f77a8',
			description: '',
			keywords: [],
			monthlyBudgetMinor: null,
			name: 'Продукты'
		};

		await service.create(USER_ID, createCategoryInputSchema.parse(input));

		await expect(service.create(USER_ID, createCategoryInputSchema.parse({
			...input,
			name: '  продукты  '
		}))).rejects.toBeInstanceOf(CategoryNameConflictError);
	});

	it('archives and restores a category without leaking another household', async () => {
		const service = createService();
		const created = await service.create(USER_ID, createCategoryInputSchema.parse({
			color: '#3f77a8',
			description: '',
			keywords: [],
			monthlyBudgetMinor: null,
			name: 'Продукты'
		}));

		const archived = await service.archive(USER_ID, {
			id: created.id,
			version: created.version
		});
		const active = await service.list(USER_ID, 'active');
		const archivedCollection = await service.list(USER_ID, 'archived');
		const restored = await service.restore(USER_ID, {
			id: created.id,
			version: archived.version
		});

		expect(active.items).toEqual([]);
		expect(archivedCollection.items).toEqual([archived]);
		expect(restored).toMatchObject({
			archivedAt: null,
			version: 3
		});

		await database.insert(categories).values({
			archivedAt: null,
			color: '#d95959',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			description: '',
			householdId: OTHER_HOUSEHOLD_ID,
			id: 'category-other',
			monthlyBudgetMinor: null,
			name: 'Чужая категория',
			normalizedName: 'чужая категория',
			updatedAt: FIXED_DATE,
			version: 1
		});
		expect((await service.list(USER_ID, 'all')).items.map((item) => item.id)).toEqual(['category-food']);
	});
});
