import type { CurrencyCodeValue } from '~/shared/lib';

import type { OperationType } from '~/entities/operation/model/types';

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { categories } from './categories';
import { contacts } from './contacts';
import { households } from './households';
import { transfers } from './transfers';
import { users } from './users';

/**
 * Stores one immutable-by-default financial ledger entry.
 */
export const operations = sqliteTable(
	'operations',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		accountId: text('account_id')
			.notNull()
			.references(() => accounts.id),
		type: text('type').$type<OperationType>().notNull(),
		amountMinor: integer('amount_minor').notNull(),
		currency: text('currency').$type<CurrencyCodeValue>().notNull(),
		amountInHouseholdBaseCurrencyMinor: integer(
			'amount_in_household_base_currency_minor'
		).notNull(),
		householdBaseCurrency: text('household_base_currency')
			.$type<CurrencyCodeValue>()
			.notNull(),
		happenedOn: text('happened_on').notNull(),
		sourceOrder: integer('source_order').notNull(),
		title: text('title').notNull(),
		comment: text('comment').notNull().default(''),
		categoryId: text('category_id')
			.references(() => categories.id, { onDelete: 'set null' }),
		categoryNameSnapshot: text('category_name_snapshot'),
		contactId: text('contact_id')
			.references(() => contacts.id, { onDelete: 'set null' }),
		contactNameSnapshot: text('contact_name_snapshot'),
		transferId: text('transfer_id')
			.references(() => transfers.id),
		exchangeRate: text('exchange_rate').notNull(),
		exchangeRateEffectiveOn: text('exchange_rate_effective_on').notNull(),
		exchangeRateSource: text('exchange_rate_source').notNull(),
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
			'operations_type_check',
			sql`${table.type} IN ('expense', 'income')`
		),
		check(
			'operations_positive_amount_check',
			sql`${table.amountMinor} > 0`
		),
		check(
			'operations_positive_base_amount_check',
			sql`${table.amountInHouseholdBaseCurrencyMinor} > 0`
		),
		uniqueIndex('operations_account_date_source_order_unique').on(
			table.accountId,
			table.happenedOn,
			table.sourceOrder
		),
		index('operations_account_deleted_date_order_idx').on(
			table.accountId,
			table.deletedAt,
			table.happenedOn,
			table.sourceOrder
		),
		index('operations_household_category_deleted_date_idx').on(
			table.householdId,
			table.categoryId,
			table.deletedAt,
			table.happenedOn
		),
		index('operations_household_contact_deleted_date_idx').on(
			table.householdId,
			table.contactId,
			table.deletedAt,
			table.happenedOn
		),
		index('operations_household_deleted_idx').on(
			table.householdId,
			table.deletedAt
		),
		index('operations_household_transfer_idx').on(
			table.householdId,
			table.transferId
		)
	]
);

export type OperationRecord = typeof operations.$inferSelect;
export type NewOperationRecord = typeof operations.$inferInsert;
