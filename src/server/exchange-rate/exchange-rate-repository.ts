import type { CurrencyCodeValue } from '~/shared/lib';

import { type AppDatabase, db } from '~/server/db/client';
import type {
	ExchangeRateRecord,
	ExchangeRateRefreshRecord,
	NewExchangeRateRecord,
	NewExchangeRateRefreshRecord
} from '~/server/db/schema';
import {
	exchangeRateRefreshes,
	exchangeRates
} from '~/server/db/schema';

import {
	and,
	desc,
	eq,
	lte
} from 'drizzle-orm';

export type FindExchangeRateInput = {
	fromCurrency: CurrencyCodeValue;
	onOrBefore: string;
	toCurrency: CurrencyCodeValue;
};

export type FindExchangeRateRefreshInput = {
	baseCurrency: CurrencyCodeValue;
	requestedOn: string;
	source: string;
};

export type ExchangeRateRepository = {
	findLatest: (
		input: FindExchangeRateInput
	) => Promise<ExchangeRateRecord | undefined>;
	findRefresh: (
		input: FindExchangeRateRefreshInput
	) => Promise<ExchangeRateRefreshRecord | undefined>;
	recordRefresh: (
		record: NewExchangeRateRefreshRecord
	) => Promise<ExchangeRateRefreshRecord>;
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

	const findRefresh = async (
		input: FindExchangeRateRefreshInput
	): Promise<ExchangeRateRefreshRecord | undefined> => {
		return database.select()
			.from(exchangeRateRefreshes)
			.where(and(
				eq(exchangeRateRefreshes.baseCurrency, input.baseCurrency),
				eq(exchangeRateRefreshes.requestedOn, input.requestedOn),
				eq(exchangeRateRefreshes.source, input.source)
			))
			.limit(1)
			.get();
	};

	const recordRefresh = async (
		record: NewExchangeRateRefreshRecord
	): Promise<ExchangeRateRefreshRecord> => {
		return database.insert(exchangeRateRefreshes)
			.values(record)
			.onConflictDoUpdate({
				target: [
					exchangeRateRefreshes.source,
					exchangeRateRefreshes.baseCurrency,
					exchangeRateRefreshes.requestedOn
				],
				set: {
					updatedAt: record.updatedAt
				}
			})
			.returning()
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
		findRefresh,
		recordRefresh,
		upsert
	};
}
