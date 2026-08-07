import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text
} from 'drizzle-orm/sqlite-core';

import { categories } from './categories';

/**
 * Stores ordered category keywords used by operation auto-selection.
 */
export const categoryKeywords = sqliteTable(
	'category_keywords',
	{
		categoryId: text('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'cascade' }),
		value: text('value').notNull(),
		normalizedValue: text('normalized_value').notNull(),
		position: integer('position').notNull()
	},
	(table) => [
		primaryKey({
			columns: [table.categoryId, table.normalizedValue],
			name: 'category_keywords_category_id_normalized_value_pk'
		}),
		index('category_keywords_category_id_position_idx').on(
			table.categoryId,
			table.position
		)
	]
);

export type CategoryKeywordRecord = typeof categoryKeywords.$inferSelect;
export type NewCategoryKeywordRecord = typeof categoryKeywords.$inferInsert;
