import { describe, expect, it } from 'vitest';

import { toCurrencyExchangeRates } from '../../../src/entities/exchange-rate';
import { CurrencyCode } from '../../../src/shared/lib';

describe('toCurrencyExchangeRates', () => {
	it('maps quotes into ratesToBaseCurrency for the snapshot base', () => {
		const rates = toCurrencyExchangeRates({
			baseCurrency: CurrencyCode.BYN,
			quotes: [
				{
					effectiveOn: '2026-08-31',
					fromCurrency: CurrencyCode.USD,
					rate: '3.25',
					source: 'nbrb',
					toCurrency: CurrencyCode.BYN
				},
				{
					effectiveOn: '2026-08-31',
					fromCurrency: CurrencyCode.EUR,
					rate: '0',
					source: 'nbrb',
					toCurrency: CurrencyCode.BYN
				}
			],
			refreshError: null,
			requestedOn: '2026-08-31',
			unavailableCurrencies: []
		});

		expect(rates).toEqual({
			baseCurrency: CurrencyCode.BYN,
			ratesToBaseCurrency: {
				[CurrencyCode.USD]: 3.25
			}
		});
	});
});
