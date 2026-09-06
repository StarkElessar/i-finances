import type { AppDatabase } from '@/infrastructure/database/client';
import { exchangeRateRefreshes, exchangeRates } from '@/infrastructure/database/schema';

import type { CurrencyCode } from '@i-finances/contracts';
import { and, desc, eq, lte } from 'drizzle-orm';

export type FindExchangeRateInput = {
	fromCurrency: CurrencyCode;
	onOrBefore: string;
	toCurrency: CurrencyCode;
};

export type UpsertExchangeRateRecord = {
	createdAt: Date;
	effectiveOn: string;
	fromCurrency: CurrencyCode;
	id: string;
	rate: string;
	source: string;
	toCurrency: CurrencyCode;
	updatedAt: Date;
};

export type ExchangeRateRefreshKey = {
	baseCurrency: CurrencyCode;
	requestedOn: string;
	source: string;
};

export type RecordExchangeRateRefresh = ExchangeRateRefreshKey & {
	createdAt: Date;
	id: string;
	updatedAt: Date;
};

/** Reads canonical daily rates while keeping Drizzle types inside infrastructure. */
export class ExchangeRateRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findLatest(input: FindExchangeRateInput) {
		return this.database.select()
			.from(exchangeRates)
			.where(and(
				eq(exchangeRates.fromCurrency, input.fromCurrency),
				eq(exchangeRates.toCurrency, input.toCurrency),
				lte(exchangeRates.effectiveOn, input.onOrBefore)
			))
			.orderBy(desc(exchangeRates.effectiveOn))
			.limit(1)
			.get();
	}

	public async upsert(record: UpsertExchangeRateRecord) {
		return this.database.insert(exchangeRates)
			.values(record)
			.onConflictDoUpdate({
				set: {
					rate: record.rate,
					source: record.source,
					updatedAt: record.updatedAt
				},
				target: [
					exchangeRates.fromCurrency,
					exchangeRates.toCurrency,
					exchangeRates.effectiveOn
				]
			})
			.returning()
			.get();
	}

	public async findRefresh(input: ExchangeRateRefreshKey) {
		return this.database.select()
			.from(exchangeRateRefreshes)
			.where(and(
				eq(exchangeRateRefreshes.source, input.source),
				eq(exchangeRateRefreshes.baseCurrency, input.baseCurrency),
				eq(exchangeRateRefreshes.requestedOn, input.requestedOn)
			))
			.limit(1)
			.get();
	}

	public async recordRefresh(record: RecordExchangeRateRefresh): Promise<void> {
		await this.database.insert(exchangeRateRefreshes)
			.values(record)
			.onConflictDoNothing();
	}
}
