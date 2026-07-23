import { describe, expect, it } from 'vitest';

import {
    convertMinorUnitsByExchangeRate,
    invertExchangeRate,
    normalizeExchangeRate
} from '~/shared/lib';

describe('money exchange rates', () => {
    it('normalizes decimal input without floating-point conversion', () => {
        expect(normalizeExchangeRate(' 3,2500 ')).toBe('3.25');
        expect(normalizeExchangeRate('0')).toBeUndefined();
        expect(normalizeExchangeRate('0.123456789012')).toBe('0.123456789012');
        expect(normalizeExchangeRate('0.1234567890123')).toBeUndefined();
    });

    it('rounds converted minor units to the nearest integer', () => {
        expect(convertMinorUnitsByExchangeRate(12_000, '3.25')).toBe(39_000);
        expect(convertMinorUnitsByExchangeRate(1, '1.5')).toBe(2);
    });

    it('uses integer arithmetic for large safe amounts', () => {
        expect(
            convertMinorUnitsByExchangeRate(2_000_000_000_000, '1.000000000001')
        ).toBe(2_000_000_000_002);
    });

    it('creates a normalized reciprocal rate', () => {
        expect(invertExchangeRate('3.25')).toBe('0.307692307692');
        expect(invertExchangeRate('0.5')).toBe('2');
    });

    it('rejects invalid amounts and unsafe conversion results', () => {
        expect(() => convertMinorUnitsByExchangeRate(-1, '1'))
            .toThrow('Amount must be a non-negative safe integer.');
        expect(() => convertMinorUnitsByExchangeRate(
            Number.MAX_SAFE_INTEGER,
            '2'
        )).toThrow('Converted amount exceeds the safe integer range.');
    });
});
