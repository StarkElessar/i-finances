import type { CurrencyCodeValue } from './currency-code';
import type { FormatCurrencyOptions } from './currency-formatter';
import { formatCurrency } from './currency-formatter';

const MINOR_UNITS_IN_MAJOR = 100;
const DECIMAL_RATE_PATTERN = /^\d+(?:[.,]\d{1,6})?$/;

export function amountToMinorUnits(amount: number): number {
    return Math.round(amount * MINOR_UNITS_IN_MAJOR);
}

export function minorUnitsToAmount(amountMinor: number): number {
    return amountMinor / MINOR_UNITS_IN_MAJOR;
}

export function formatMinorUnitsCurrency(
    amountMinor: number,
    currency: CurrencyCodeValue,
    options?: FormatCurrencyOptions
): string {
    return formatCurrency(minorUnitsToAmount(amountMinor), currency, options);
}

/**
 * Formats integer minor units for an editable money input.
 */
export function formatMinorUnitsAsInput(amountMinor: number): string {
    return minorUnitsToAmount(amountMinor).toFixed(2).replace('.', ',');
}

/**
 * Parses an optional non-negative money value with at most two fractional digits.
 *
 * `null` represents an empty field, while `undefined` represents invalid input.
 */
export function parseOptionalMoneyInputToMinorUnits(value: string): number | null | undefined {
    const normalizedValue = value.trim().replace(/\s/g, '').replace(',', '.');

    if (!normalizedValue) {
        return null;
    }

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
        return undefined;
    }

    const amount = Number(normalizedValue);

    return Number.isFinite(amount) ? amountToMinorUnits(amount) : undefined;
}

/**
 * Normalizes a positive decimal exchange rate for persistent storage.
 *
 * The string representation preserves decimal intent and avoids persisting
 * binary floating-point artifacts.
 */
export function normalizeExchangeRate(value: string): string | undefined {
    const normalizedValue = value.trim().replace(/\s/g, '').replace(',', '.');

    if (!DECIMAL_RATE_PATTERN.test(normalizedValue)) {
        return undefined;
    }

    const [wholePart, fractionPart = ''] = normalizedValue.split('.');
    const normalizedFraction = fractionPart.replace(/0+$/, '');
    const normalizedRate = normalizedFraction
        ? `${wholePart}.${normalizedFraction}`
        : wholePart;

    return Number(wholePart) > 0 || /[1-9]/.test(fractionPart)
        ? normalizedRate
        : undefined;
}

/**
 * Converts minor units with a persisted decimal rate using integer arithmetic.
 */
export function convertMinorUnitsByExchangeRate(
    amountMinor: number,
    exchangeRate: string
): number {
    const normalizedRate = normalizeExchangeRate(exchangeRate);

    if (normalizedRate === undefined) {
        throw new Error(`Invalid positive exchange rate: ${exchangeRate}`);
    }

    const [wholePart, fractionPart = ''] = normalizedRate.split('.');
    const scale = 10 ** fractionPart.length;
    const rateUnits = Number(`${wholePart}${fractionPart}`);

    if (
        !Number.isSafeInteger(amountMinor)
        || !Number.isSafeInteger(rateUnits)
        || amountMinor > Number.MAX_SAFE_INTEGER / rateUnits
    ) {
        throw new Error('Converted amount exceeds the safe integer range.');
    }

    return Math.round((amountMinor * rateUnits) / scale);
}
