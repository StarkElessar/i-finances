import { describe, expect, it } from 'vitest';

import {
    convertMinorUnitsByExchangeRate,
    normalizeExchangeRate
} from '~/shared/lib';

describe('money exchange rates', () => {
    it('normalizes decimal input without floating-point conversion', () => {
        expect(normalizeExchangeRate(' 3,2500 ')).toBe('3.25');
        expect(normalizeExchangeRate('0')).toBeUndefined();
    });

    it('rounds converted minor units to the nearest integer', () => {
        expect(convertMinorUnitsByExchangeRate(12_000, '3.25')).toBe(39_000);
        expect(convertMinorUnitsByExchangeRate(1, '1.5')).toBe(2);
    });
});
