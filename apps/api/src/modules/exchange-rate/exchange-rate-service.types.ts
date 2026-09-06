import type { CurrencyCode } from '@i-finances/contracts';

export type UpsertExchangeRateInput = {
	effectiveOn: string;
	fromCurrency: CurrencyCode;
	rate: string;
	source: string;
	toCurrency: CurrencyCode;
};

export type RefreshDailyExchangeRatesInput = {
	baseCurrency: CurrencyCode;
	currencies: readonly CurrencyCode[];
	requestedOn: string;
};

export type GetCurrentExchangeRatesInput = RefreshDailyExchangeRatesInput;

export type DailyExchangeRateProvider = {
	getDailyRates(
		input: RefreshDailyExchangeRatesInput
	): Promise<UpsertExchangeRateInput[]>;
	source: string;
};
