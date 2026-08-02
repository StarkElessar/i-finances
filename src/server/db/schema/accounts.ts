import type {
	AccountTypeValue,
	CurrencyCodeValue
} from '~/shared/lib';

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

/**
 * Stores one financial account owned by a household.
 */
export const accounts = sqliteTable(
	'accounts',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		type: text('type').$type<AccountTypeValue>().notNull(),
		currency: text('currency').$type<CurrencyCodeValue>().notNull(),
		color: text('color').notNull(),
		initialBalanceMinor: integer('initial_balance_minor').notNull(),
		isColorAccentEnabled: integer('is_color_accent_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		isIncludedInFamilyTotal: integer('is_included_in_family_total', { mode: 'boolean' })
			.notNull()
			.default(true),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		index('accounts_household_id_archived_at_idx').on(
			table.householdId,
			table.archivedAt
		)
	]
);

/**
 * Database row returned for an account.
 */
export type AccountRecord = typeof accounts.$inferSelect;

/**
 * Values accepted when creating an account.
 */
export type NewAccountRecord = typeof accounts.$inferInsert;
