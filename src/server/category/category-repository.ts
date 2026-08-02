import type { CategoryListStatus } from '~/entities/category/api/category.contract';

import { type AppDatabase, db } from '~/server/db/client';
import type {
	CategoryKeywordRecord,
	CategoryRecord,
	NewCategoryKeywordRecord,
	NewCategoryRecord
} from '~/server/db/schema';
import {
	categories,
	categoryKeywords
} from '~/server/db/schema';

import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	sql
} from 'drizzle-orm';

export type CategoryAggregateRecord = {
	category: CategoryRecord;
	keywords: CategoryKeywordRecord[];
};

export type CategoryUpdateValues = {
	color: string;
	description: string;
	monthlyBudgetMinor: number | null;
	name: string;
	normalizedName: string;
	updatedAt: Date;
};

export type CategoryRepository = {
	findById: (
		householdId: string,
		categoryId: string
	) => Promise<CategoryAggregateRecord | undefined>;
	findIdByNormalizedName: (
		householdId: string,
		normalizedName: string
	) => Promise<string | undefined>;
	insert: (
		record: NewCategoryRecord,
		keywords: NewCategoryKeywordRecord[]
	) => Promise<CategoryAggregateRecord | undefined>;
	list: (
		householdId: string,
		status: CategoryListStatus
	) => Promise<CategoryAggregateRecord[]>;
	setArchivedAt: (
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	) => Promise<CategoryAggregateRecord | undefined>;
	update: (
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		values: CategoryUpdateValues,
		keywords: NewCategoryKeywordRecord[]
	) => Promise<CategoryAggregateRecord | undefined>;
};

/**
 * Creates a category repository scoped by household on every read and write.
 */
export function createCategoryRepository(
	database: AppDatabase = db
): CategoryRepository {
	const list = async (
		householdId: string,
		status: CategoryListStatus
	): Promise<CategoryAggregateRecord[]> => {
		const householdCondition = eq(categories.householdId, householdId);
		const archiveCondition = status === 'active'
			? isNull(categories.archivedAt)
			: isNotNull(categories.archivedAt);
		const where = status === 'all'
			? householdCondition
			: and(householdCondition, archiveCondition);
		const rows = await database.select({
			category: categories,
			keyword: categoryKeywords
		})
			.from(categories)
			.leftJoin(
				categoryKeywords,
				eq(categoryKeywords.categoryId, categories.id)
			)
			.where(where)
			.orderBy(
				asc(categories.createdAt),
				asc(categories.name),
				asc(categories.id),
				asc(categoryKeywords.position)
			);

		return aggregateCategoryRows(rows);
	};

	const findById = async (
		householdId: string,
		categoryId: string
	): Promise<CategoryAggregateRecord | undefined> => {
		const rows = await database.select({
			category: categories,
			keyword: categoryKeywords
		})
			.from(categories)
			.leftJoin(
				categoryKeywords,
				eq(categoryKeywords.categoryId, categories.id)
			)
			.where(and(
				eq(categories.householdId, householdId),
				eq(categories.id, categoryId)
			))
			.orderBy(asc(categoryKeywords.position));

		return aggregateCategoryRows(rows)[0];
	};

	const findIdByNormalizedName = async (
		householdId: string,
		normalizedName: string
	): Promise<string | undefined> => {
		const record = database.select({ id: categories.id })
			.from(categories)
			.where(and(
				eq(categories.householdId, householdId),
				eq(categories.normalizedName, normalizedName)
			))
			.limit(1)
			.get();

		return record?.id;
	};

	const insert = async (
		record: NewCategoryRecord,
		keywords: NewCategoryKeywordRecord[]
	): Promise<CategoryAggregateRecord | undefined> => {
		return database.transaction((transaction) => {
			const createdCategory = transaction.insert(categories)
				.values(record)
				.onConflictDoNothing()
				.returning()
				.get() as CategoryRecord | undefined;

			if (createdCategory === undefined) {
				return undefined;
			}

			if (keywords.length > 0) {
				transaction.insert(categoryKeywords).values(keywords).run();
			}

			return {
				category: createdCategory,
				keywords: keywords.map(toKeywordRecord)
			};
		});
	};

	const update = async (
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		values: CategoryUpdateValues,
		keywords: NewCategoryKeywordRecord[]
	): Promise<CategoryAggregateRecord | undefined> => {
		return database.transaction((transaction) => {
			const updatedCategory = transaction.update(categories)
				.set({
					...values,
					version: sql`${categories.version} + 1`
				})
				.where(and(
					eq(categories.householdId, householdId),
					eq(categories.id, categoryId),
					eq(categories.version, expectedVersion)
				))
				.returning()
				.get() as CategoryRecord | undefined;

			if (updatedCategory === undefined) {
				return undefined;
			}

			transaction.delete(categoryKeywords)
				.where(eq(categoryKeywords.categoryId, categoryId))
				.run();

			if (keywords.length > 0) {
				transaction.insert(categoryKeywords).values(keywords).run();
			}

			return {
				category: updatedCategory,
				keywords: keywords.map(toKeywordRecord)
			};
		});
	};

	const setArchivedAt = async (
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<CategoryAggregateRecord | undefined> => {
		const updatedCategory = database.update(categories)
			.set({
				archivedAt,
				updatedAt,
				version: sql`${categories.version} + 1`
			})
			.where(and(
				eq(categories.householdId, householdId),
				eq(categories.id, categoryId),
				eq(categories.version, expectedVersion)
			))
			.returning()
			.get() as CategoryRecord | undefined;

		if (updatedCategory === undefined) {
			return undefined;
		}

		const keywordRecords = await database.select()
			.from(categoryKeywords)
			.where(eq(categoryKeywords.categoryId, categoryId))
			.orderBy(asc(categoryKeywords.position));

		return {
			category: updatedCategory,
			keywords: keywordRecords
		};
	};

	return {
		findById,
		findIdByNormalizedName,
		insert,
		list,
		setArchivedAt,
		update
	};
}

type CategoryJoinRow = {
	category: CategoryRecord;
	keyword: CategoryKeywordRecord | null;
};

function aggregateCategoryRows(
	rows: readonly CategoryJoinRow[]
): CategoryAggregateRecord[] {
	const aggregates = new Map<string, CategoryAggregateRecord>();

	rows.forEach((row) => {
		let aggregate = aggregates.get(row.category.id);

		if (aggregate === undefined) {
			aggregate = {
				category: row.category,
				keywords: []
			};
			aggregates.set(row.category.id, aggregate);
		}

		if (row.keyword !== null) {
			aggregate.keywords.push(row.keyword);
		}
	});

	return [...aggregates.values()];
}

function toKeywordRecord(
	keyword: NewCategoryKeywordRecord
): CategoryKeywordRecord {
	return {
		categoryId: keyword.categoryId,
		normalizedValue: keyword.normalizedValue,
		position: keyword.position,
		value: keyword.value
	};
}
