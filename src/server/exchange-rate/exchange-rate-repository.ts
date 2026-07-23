import {
    and,
    desc,
    eq,
    lte
} from 'drizzle-orm';

import { type AppDatabase, db } from '~/server/db/client';
import type {
    ExchangeRateRecord,
    NewExchangeRateRecord
} from '~/server/db/schema';
import { exchangeRates } from '~/server/db/schema';
import type { CurrencyCodeValue } from '~/shared/lib';

export type FindExchangeRateInput = {
    fromCurrency: CurrencyCodeValue;
    onOrBefore: string;
    toCurrency: CurrencyCodeValue;
};

export type ExchangeRateRepository = {
    findLatest: (
        input: FindExchangeRateInput
    ) => Promise<ExchangeRateRecord | undefined>;
    upsert: (
        record: NewExchangeRateRecord
    ) => Promise<ExchangeRateRecord>;
};

/**
 * Creates the persistence adapter for canonical daily exchange rates.
 */
export function createExchangeRateRepository(
    database: AppDatabase = db
): ExchangeRateRepository {
    const findLatest = async (
        input: FindExchangeRateInput
    ): Promise<ExchangeRateRecord | undefined> => {
        return database.select()
            .from(exchangeRates)
            .where(and(
                eq(exchangeRates.fromCurrency, input.fromCurrency),
                eq(exchangeRates.toCurrency, input.toCurrency),
                lte(exchangeRates.effectiveOn, input.onOrBefore)
            ))
            .orderBy(desc(exchangeRates.effectiveOn))
            .limit(1)
            .get();
    };

    const upsert = async (
        record: NewExchangeRateRecord
    ): Promise<ExchangeRateRecord> => {
        return database.insert(exchangeRates)
            .values(record)
            .onConflictDoUpdate({
                target: [
                    exchangeRates.fromCurrency,
                    exchangeRates.toCurrency,
                    exchangeRates.effectiveOn
                ],
                set: {
                    rate: record.rate,
                    source: record.source,
                    updatedAt: record.updatedAt
                }
            })
            .returning()
            .get();
    };

    return {
        findLatest,
        upsert
    };
}
