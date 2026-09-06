import { z } from 'zod';

import { currencyCodeSchema } from './category';

const localDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажите дату в формате ГГГГ-ММ-ДД.');

/**
 * Immutable rate for a currency pair. The conversion contract is
 * `to amount = from amount * rate`.
 */
export const exchangeRateQuoteSchema = z.object({
	effectiveOn: localDateKeySchema,
	fromCurrency: currencyCodeSchema,
	rate: z.string().min(1),
	source: z.string().min(1),
	toCurrency: currencyCodeSchema
});

export type ExchangeRateQuote = z.infer<typeof exchangeRateQuoteSchema>;

/**
 * Latest daily snapshot. A failed refresh is reported in `refreshError`
 * rather than failing the request, so stored rates stay usable.
 */
export const currentExchangeRatesSchema = z.object({
	baseCurrency: currencyCodeSchema,
	quotes: z.array(exchangeRateQuoteSchema),
	refreshError: z.string().nullable(),
	requestedOn: localDateKeySchema,
	unavailableCurrencies: z.array(currencyCodeSchema)
});

export type CurrentExchangeRates = z.infer<typeof currentExchangeRatesSchema>;
