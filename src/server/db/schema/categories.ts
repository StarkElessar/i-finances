import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

/**
 * Stores one expense category owned by a household.
 */
export const categories = sqliteTable(
	'categories',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		normalizedName: text('normalized_name').notNull(),
		description: text('description').notNull().default(''),
		color: text('color').notNull(),
		monthlyBudgetMinor: integer('monthly_budget_minor'),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		index('categories_household_id_archived_at_idx').on(
			table.householdId,
			table.archivedAt
		),
		uniqueIndex('categories_household_id_normalized_name_unique').on(
			table.householdId,
			table.normalizedName
		)
	]
);

export type CategoryRecord = typeof categories.$inferSelect;
export type NewCategoryRecord = typeof categories.$inferInsert;
