import type { CurrencyCodeValue } from '~/shared/lib';

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Stores one isolated family finance workspace.
 */
export const households = sqliteTable('households', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	baseCurrency: text('base_currency').$type<CurrencyCodeValue>().notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/**
 * Database row returned for a household.
 */
export type HouseholdRecord = typeof households.$inferSelect;

/**
 * Values accepted when creating a household.
 */
export type NewHouseholdRecord = typeof households.$inferInsert;
