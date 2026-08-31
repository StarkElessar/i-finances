import type { CurrencyCodeValue, CurrencyExchangeRates } from '~/shared/lib';

import type { CurrentExchangeRates } from './types';

/**
 * Maps a current daily FX snapshot into converter-friendly rates-to-base.
 */
export function toCurrencyExchangeRates(
	currentExchangeRates: CurrentExchangeRates
): CurrencyExchangeRates {
	const ratesToBaseCurrency: Partial<Record<CurrencyCodeValue, number>> = {};

	currentExchangeRates.quotes.forEach((quote) => {
		const rate = Number(quote.rate);

		if (
			quote.toCurrency === currentExchangeRates.baseCurrency
			&& Number.isFinite(rate)
			&& rate > 0
		) {
			ratesToBaseCurrency[quote.fromCurrency] = rate;
		}
	});

	return {
		baseCurrency: currentExchangeRates.baseCurrency,
		ratesToBaseCurrency
	};
}
