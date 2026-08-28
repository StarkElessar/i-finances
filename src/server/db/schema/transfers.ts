import type { CurrencyCodeValue } from '~/shared/lib';

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	sqliteTable,
	text
} from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { contacts } from './contacts';
import { households } from './households';
import { users } from './users';

/**
 * Stores one cross-account money transfer owned by a household.
 */
export const transfers = sqliteTable(
	'transfers',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		fromAccountId: text('from_account_id')
			.notNull()
			.references(() => accounts.id),
		toAccountId: text('to_account_id')
			.notNull()
			.references(() => accounts.id),
		fromAmountMinor: integer('from_amount_minor').notNull(),
		toAmountMinor: integer('to_amount_minor').notNull(),
		exchangeFromCurrency: text('exchange_from_currency')
			.$type<CurrencyCodeValue>()
			.notNull(),
		exchangeToCurrency: text('exchange_to_currency')
			.$type<CurrencyCodeValue>()
			.notNull(),
		exchangeRate: text('exchange_rate').notNull(),
		happenedOn: text('happened_on').notNull(),
		comment: text('comment').notNull().default(''),
		contactId: text('contact_id')
			.references(() => contacts.id, { onDelete: 'set null' }),
		contactNameSnapshot: text('contact_name_snapshot'),
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
		deletedByUserId: text('deleted_by_user_id')
			.references(() => users.id),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id),
		updatedByUserId: text('updated_by_user_id')
			.notNull()
			.references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		check(
			'transfers_positive_from_amount_check',
			sql`${table.fromAmountMinor} > 0`
		),
		check(
			'transfers_positive_to_amount_check',
			sql`${table.toAmountMinor} > 0`
		),
		check(
			'transfers_different_accounts_check',
			sql`${table.fromAccountId} <> ${table.toAccountId}`
		),
		check(
			'transfers_different_currencies_check',
			sql`${table.exchangeFromCurrency} <> ${table.exchangeToCurrency}`
		),
		index('transfers_household_deleted_idx').on(
			table.householdId,
			table.deletedAt
		),
		index('transfers_household_from_account_idx').on(
			table.householdId,
			table.fromAccountId
		),
		index('transfers_household_to_account_idx').on(
			table.householdId,
			table.toAccountId
		)
	]
);

export type TransferRecord = typeof transfers.$inferSelect;
export type NewTransferRecord = typeof transfers.$inferInsert;
