import type {
	ExchangeRateQuote,
	PersistedExchangeRate
} from '~/entities/exchange-rate';
import type { ExchangeRateRecord } from '~/server/db/schema';

export function toExchangeRateQuote(
	record: ExchangeRateRecord
): ExchangeRateQuote {
	return {
		effectiveOn: record.effectiveOn,
		fromCurrency: record.fromCurrency,
		rate: record.rate,
		source: record.source,
		toCurrency: record.toCurrency
	};
}

export function toPersistedExchangeRate(
	record: ExchangeRateRecord
): PersistedExchangeRate {
	return {
		...toExchangeRateQuote(record),
		createdAt: record.createdAt.toISOString(),
		id: record.id,
		updatedAt: record.updatedAt.toISOString()
	};
}
