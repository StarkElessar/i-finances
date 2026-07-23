import { z } from 'zod';

import {
    CURRENCY_CODES,
    normalizeExchangeRate
} from '~/shared/lib';

const LOCAL_DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const currencyPairFields = {
    fromCurrency: z.enum(CURRENCY_CODES),
    toCurrency: z.enum(CURRENCY_CODES)
};

const effectiveOnSchema = z.string()
    .regex(LOCAL_DATE_KEY_PATTERN, 'Use the YYYY-MM-DD date format.')
    .refine(isValidLocalDateKey, 'Exchange-rate date does not exist.');

const rateSchema = z.string().transform((value, context) => {
    const normalizedRate = normalizeExchangeRate(value);

    if (normalizedRate !== undefined) {
        return normalizedRate;
    }

    context.addIssue({
        code: 'custom',
        message: 'Exchange rate must be a positive decimal value.'
    });

    return z.NEVER;
});

/**
 * Validates lookup of the latest rate available on a given local date.
 */
export const resolveExchangeRateInputSchema = z.object({
    ...currencyPairFields,
    onDate: effectiveOnSchema
});

/**
 * Validates one canonical exchange rate written to persistent storage.
 */
export const upsertExchangeRateInputSchema = z.object({
    ...currencyPairFields,
    effectiveOn: effectiveOnSchema,
    rate: rateSchema,
    source: z.string().trim().min(1).max(64)
}).refine(
    (input) => input.fromCurrency !== input.toCurrency,
    {
        message: 'Stored exchange-rate currencies must be different.',
        path: ['toCurrency']
    }
);

export type ResolveExchangeRateInput = z.infer<
    typeof resolveExchangeRateInputSchema
>;
export type UpsertExchangeRateInput = z.infer<
    typeof upsertExchangeRateInputSchema
>;

function isValidLocalDateKey(value: string): boolean {
    const match = LOCAL_DATE_KEY_PATTERN.exec(value);

    if (match === null) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}
