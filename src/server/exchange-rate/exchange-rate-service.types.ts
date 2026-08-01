import type { ExchangeRateRepository } from './exchange-rate-repository';

import type {
	CurrentExchangeRates,
	ExchangeRateQuote,
	GetCurrentExchangeRatesInput,
	PersistedExchangeRate,
	RefreshDailyExchangeRatesInput,
	ResolveExchangeRateInput,
	UpsertExchangeRateInput
} from '~/entities/exchange-rate';

/**
 * Narrow dependency consumed by transaction services.
 */
export type ExchangeRateResolver = {
	resolve: (
		input: ResolveExchangeRateInput
	) => Promise<ExchangeRateQuote>;
};

export type DailyExchangeRateProvider = {
	getDailyRates: (
		input: RefreshDailyExchangeRatesInput
	) => Promise<UpsertExchangeRateInput[]>;
	source: string;
};

export type ExchangeRateService = ExchangeRateResolver & {
	getCurrent: (
		input: GetCurrentExchangeRatesInput
	) => Promise<CurrentExchangeRates>;
	refreshDaily: (
		input: RefreshDailyExchangeRatesInput
	) => Promise<PersistedExchangeRate[]>;
	upsert: (
		input: UpsertExchangeRateInput
	) => Promise<PersistedExchangeRate>;
};

export type ExchangeRateServiceDependencies = {
	exchangeRateRepository: ExchangeRateRepository;
	createId?: () => string;
	dailyRateProvider?: DailyExchangeRateProvider;
	now?: () => Date;
};
