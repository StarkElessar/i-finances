import { describe, expect, it } from 'vitest';

import { convertCurrency, CurrencyCode, type CurrencyExchangeRates, sumMoney } from '../../../src/shared/lib';

const exchangeRates = {
    baseCurrency: CurrencyCode.BYN,
    ratesToBaseCurrency: {
        [CurrencyCode.USD]: 3.25,
        [CurrencyCode.EUR]: 3.75
    }
} satisfies CurrencyExchangeRates;

describe('CurrencyCode', () => {
    it('exposes supported currency values from enum-like class', () => {
        expect(CurrencyCode.values()).toEqual(['BYN', 'USD', 'EUR']);
        expect(CurrencyCode.isCurrencyCode('USD')).toBe(true);
        expect(CurrencyCode.isCurrencyCode('PLN')).toBe(false);
    });
});

describe('convertCurrency', () => {
    it('converts account currency through the configured base currency', () => {
        expect(convertCurrency(10, CurrencyCode.USD, CurrencyCode.BYN, exchangeRates)).toBe(32.5);
        expect(convertCurrency(37.5, CurrencyCode.BYN, CurrencyCode.EUR, exchangeRates)).toBe(10);
    });

    it('sums mixed currency amounts in the target currency', () => {
        const total = sumMoney([
            { amount: 100, currency: CurrencyCode.BYN },
            { amount: 10, currency: CurrencyCode.USD },
            { amount: 2, currency: CurrencyCode.EUR }
        ], CurrencyCode.BYN, exchangeRates);

        expect(total).toBe(140);
    });
});
