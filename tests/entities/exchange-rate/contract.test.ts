import { describe, expect, it } from 'vitest';

import {
    resolveExchangeRateInputSchema,
    upsertExchangeRateInputSchema
} from '~/entities/exchange-rate';
import { CurrencyCode } from '~/shared/lib';

describe('exchange-rate contracts', () => {
    it('normalizes a canonical directed rate', () => {
        expect(upsertExchangeRateInputSchema.parse({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: ' 3,2500 ',
            source: ' manual ',
            toCurrency: CurrencyCode.BYN
        })).toEqual({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });
    });

    it('rejects a nonexistent date and an identity storage record', () => {
        expect(upsertExchangeRateInputSchema.safeParse({
            effectiveOn: '2026-02-30',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        }).success).toBe(false);
        expect(upsertExchangeRateInputSchema.safeParse({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '1',
            source: 'manual',
            toCurrency: CurrencyCode.USD
        }).success).toBe(false);
    });

    it('allows resolving an identity pair without storing it', () => {
        expect(resolveExchangeRateInputSchema.safeParse({
            fromCurrency: CurrencyCode.EUR,
            onDate: '2026-07-24',
            toCurrency: CurrencyCode.EUR
        }).success).toBe(true);
    });
});
