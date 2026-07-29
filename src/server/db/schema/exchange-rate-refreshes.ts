import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { CurrencyCodeValue } from '~/shared/lib';

/**
 * Stores successful daily exchange-rate refreshes from external providers.
 */
export const exchangeRateRefreshes = sqliteTable(
    'exchange_rate_refreshes',
    {
        id: text('id').primaryKey(),
        baseCurrency: text('base_currency')
            .$type<CurrencyCodeValue>()
            .notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        requestedOn: text('requested_on').notNull(),
        source: text('source').notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        uniqueIndex('exchange_rate_refreshes_source_base_requested_unique').on(
            table.source,
            table.baseCurrency,
            table.requestedOn
        )
    ]
);

export type ExchangeRateRefreshRecord =
    typeof exchangeRateRefreshes.$inferSelect;
export type NewExchangeRateRefreshRecord =
    typeof exchangeRateRefreshes.$inferInsert;
