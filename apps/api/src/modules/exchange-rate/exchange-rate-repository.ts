import type { AppDatabase } from '@/infrastructure/database/client';
import { exchangeRates } from '@/infrastructure/database/schema';

import type { CurrencyCode } from '@i-finances/contracts';
import { and, desc, eq, lte } from 'drizzle-orm';

export type FindExchangeRateInput = {
	fromCurrency: CurrencyCode;
	onOrBefore: string;
	toCurrency: CurrencyCode;
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
}
