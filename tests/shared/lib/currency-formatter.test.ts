import { describe, expect, it } from 'vitest';

import { BELARUSIAN_RUBLE_SYMBOL, formatCurrency, getCurrencySymbol } from '../../../src/shared/lib';

describe('formatCurrency', () => {
    it('formats Belarusian rubles with the new graphic symbol', () => {
        expect(formatCurrency(1234.56, 'BYN')).toBe(`1\u00A0234,56\u00A0${BELARUSIAN_RUBLE_SYMBOL}`);
    });

    it('formats US dollars and euros', () => {
        expect(formatCurrency(1234.56, 'USD')).toBe('1\u00A0234,56\u00A0$');
        expect(formatCurrency(1234.56, 'EUR')).toBe('1\u00A0234,56\u00A0€');
    });

    it('allows overriding locale, precision and currency display', () => {
        expect(formatCurrency(1234.5, 'EUR', { locale: 'en-US' })).toBe('€1,234.50');
        expect(formatCurrency(1234, 'BYN', {
            currencyDisplay: 'code',
            maximumFractionDigits: 0,
            minimumFractionDigits: 0,
            useGrouping: false
        })).toBe('1234\u00A0BYN');
    });
});

describe('getCurrencySymbol', () => {
    it('returns the configured symbol for a supported currency', () => {
        expect(getCurrencySymbol('BYN')).toBe(BELARUSIAN_RUBLE_SYMBOL);
    });
});
