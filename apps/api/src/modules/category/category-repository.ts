import type { AppDatabase } from '@/infrastructure/database/client';
import {
	categories,
	categoryKeywords
} from '@/infrastructure/database/schema';

import type { CategoryListStatus } from '@i-finances/contracts';
import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	sql
} from 'drizzle-orm';

export type CategoryRecord = {
	archivedAt: Date | null;
	color: string;
	createdAt: Date;
	createdByUserId: string;
	description: string;
	householdId: string;
	id: string;
	monthlyBudgetMinor: number | null;
	name: string;
	normalizedName: string;
	updatedAt: Date;
	version: number;
};

export type CategoryKeywordRecord = {
	categoryId: string;
	normalizedValue: string;
	position: number;
	value: string;
};

export type CategoryAggregateRecord = {
	category: CategoryRecord;
	keywords: CategoryKeywordRecord[];
};

export type NewCategoryRecord = Omit<CategoryRecord, 'version'> & {
	version?: number;
};

export type NewCategoryKeywordRecord = CategoryKeywordRecord;

export type CategoryUpdateValues = {
	color: string;
	description: string;
	monthlyBudgetMinor: number | null;
	name: string;
	normalizedName: string;
	updatedAt: Date;
};

export class CategoryRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async list(
		householdId: string,
		status: CategoryListStatus
	): Promise<CategoryAggregateRecord[]> {
		const householdCondition = eq(categories.householdId, householdId);
		const archiveCondition = status === 'active'
			? isNull(categories.archivedAt)
			: isNotNull(categories.archivedAt);
		const where = status === 'all'
			? householdCondition
			: and(householdCondition, archiveCondition);
		const rows = await this.database.select({
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

		return this.aggregateCategoryRows(rows);
	}

	public async findById(
		householdId: string,
		categoryId: string
	): Promise<CategoryAggregateRecord | undefined> {
		const rows = await this.database.select({
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

		return this.aggregateCategoryRows(rows)[0];
	}

	public async findIdByNormalizedName(
		householdId: string,
		normalizedName: string
	): Promise<string | undefined> {
		const record = this.database.select({ id: categories.id })
			.from(categories)
			.where(and(
				eq(categories.householdId, householdId),
				eq(categories.normalizedName, normalizedName)
			))
			.limit(1)
			.get();

		return record?.id;
	}

	public async insert(
		record: NewCategoryRecord,
		keywords: NewCategoryKeywordRecord[]
	): Promise<CategoryAggregateRecord | undefined> {
		return this.database.transaction((transaction) => {
			const createdCategory = transaction.insert(categories)
				.values(record)
				.onConflictDoNothing()
				.returning()
				.get() as typeof categories.$inferSelect | undefined;

			if (createdCategory === undefined) {
				return undefined;
			}

			if (keywords.length > 0) {
				transaction.insert(categoryKeywords).values(keywords).run();
			}

			return {
				category: this.toCategoryRecord(createdCategory),
				keywords
			};
		});
	}

	public async update(
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		values: CategoryUpdateValues,
		keywords: NewCategoryKeywordRecord[]
	): Promise<CategoryAggregateRecord | undefined> {
		return this.database.transaction((transaction) => {
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
				.get() as typeof categories.$inferSelect | undefined;

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
				category: this.toCategoryRecord(updatedCategory),
				keywords
			};
		});
	}

	public async setArchivedAt(
		householdId: string,
		categoryId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<CategoryAggregateRecord | undefined> {
		const updatedCategory = this.database.update(categories)
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
			.get() as typeof categories.$inferSelect | undefined;

		if (updatedCategory === undefined) {
			return undefined;
		}

		const keywords = await this.database.select()
			.from(categoryKeywords)
			.where(eq(categoryKeywords.categoryId, categoryId))
			.orderBy(asc(categoryKeywords.position));

		return {
			category: this.toCategoryRecord(updatedCategory),
			keywords: keywords.map((keyword) => this.toCategoryKeywordRecord(keyword))
		};
	}

	private aggregateCategoryRows(
		rows: readonly {
			category: typeof categories.$inferSelect;
			keyword: typeof categoryKeywords.$inferSelect | null;
		}[]
	): CategoryAggregateRecord[] {
		const aggregates = new Map<string, CategoryAggregateRecord>();

		rows.forEach((row) => {
			let aggregate = aggregates.get(row.category.id);

			if (aggregate === undefined) {
				aggregate = {
					category: this.toCategoryRecord(row.category),
					keywords: []
				};
				aggregates.set(row.category.id, aggregate);
			}

			if (row.keyword !== null) {
				aggregate.keywords.push(this.toCategoryKeywordRecord(row.keyword));
			}
		});

		return [...aggregates.values()];
	}

	private toCategoryRecord(
		record: typeof categories.$inferSelect
	): CategoryRecord {
		return {
			archivedAt: record.archivedAt,
			color: record.color,
			createdAt: record.createdAt,
			createdByUserId: record.createdByUserId,
			description: record.description,
			householdId: record.householdId,
			id: record.id,
			monthlyBudgetMinor: record.monthlyBudgetMinor,
			name: record.name,
			normalizedName: record.normalizedName,
			updatedAt: record.updatedAt,
			version: record.version
		};
	}

	private toCategoryKeywordRecord(
		record: typeof categoryKeywords.$inferSelect
	): CategoryKeywordRecord {
		return {
			categoryId: record.categoryId,
			normalizedValue: record.normalizedValue,
			position: record.position,
			value: record.value
		};
	}
}
