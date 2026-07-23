import type { ExchangeRateRepository } from './exchange-rate-repository';

import type {
    ExchangeRateQuote,
    PersistedExchangeRate,
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

export type ExchangeRateService = ExchangeRateResolver & {
    upsert: (
        input: UpsertExchangeRateInput
    ) => Promise<PersistedExchangeRate>;
};

export type ExchangeRateServiceDependencies = {
    exchangeRateRepository: ExchangeRateRepository;
    createId?: () => string;
    now?: () => Date;
};
