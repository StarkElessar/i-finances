import type { CurrencyCodeValue } from '~/shared/lib';

import { sql } from 'drizzle-orm';
import {
	check,
	integer,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

/**
 * Stores one canonical daily rate for a directed currency pair.
 */
export const exchangeRates = sqliteTable(
	'exchange_rates',
	{
		id: text('id').primaryKey(),
		fromCurrency: text('from_currency')
			.$type<CurrencyCodeValue>()
			.notNull(),
		toCurrency: text('to_currency')
			.$type<CurrencyCodeValue>()
			.notNull(),
		rate: text('rate').notNull(),
		effectiveOn: text('effective_on').notNull(),
		source: text('source').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		check(
			'exchange_rates_different_currencies_check',
			sql`${table.fromCurrency} <> ${table.toCurrency}`
		),
		uniqueIndex('exchange_rates_pair_effective_on_unique').on(
			table.fromCurrency,
			table.toCurrency,
			table.effectiveOn
		)
	]
);

export type ExchangeRateRecord = typeof exchangeRates.$inferSelect;
export type NewExchangeRateRecord = typeof exchangeRates.$inferInsert;
