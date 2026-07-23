import type { CurrencyCodeValue } from '~/shared/lib';

/**
 * Immutable rate returned for a requested currency pair.
 *
 * The conversion contract is: `to amount = from amount * rate`.
 */
export type ExchangeRateQuote = {
    effectiveOn: string;
    fromCurrency: CurrencyCodeValue;
    rate: string;
    source: string;
    toCurrency: CurrencyCodeValue;
};

/**
 * Canonical exchange-rate record stored in the database.
 */
export type PersistedExchangeRate = ExchangeRateQuote & {
    createdAt: string;
    id: string;
    updatedAt: string;
};
