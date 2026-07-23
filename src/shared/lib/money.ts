import type { CurrencyCodeValue } from './currency-code';
import type { FormatCurrencyOptions } from './currency-formatter';
import { formatCurrency } from './currency-formatter';

const MINOR_UNITS_IN_MAJOR = 100;
const EXCHANGE_RATE_FRACTION_DIGITS = 12;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_TEN = BigInt(10);
const DECIMAL_RATE_PATTERN = new RegExp(
    `^\\d+(?:[.,]\\d{1,${EXCHANGE_RATE_FRACTION_DIGITS}})?$`
);

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
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
        throw new Error('Amount must be a non-negative safe integer.');
    }

    const ratio = parseExchangeRateRatio(exchangeRate);
    const convertedAmount = divideAndRound(
        BigInt(amountMinor) * ratio.numerator,
        ratio.denominator
    );

    if (convertedAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Converted amount exceeds the safe integer range.');
    }

    return Number(convertedAmount);
}

/**
 * Produces the reciprocal of a persisted decimal exchange rate.
 */
export function invertExchangeRate(exchangeRate: string): string {
    const ratio = parseExchangeRateRatio(exchangeRate);
    const scale = BIGINT_TEN ** BigInt(EXCHANGE_RATE_FRACTION_DIGITS);
    const inverseUnits = divideAndRound(
        ratio.denominator * scale,
        ratio.numerator
    );

    if (inverseUnits === BIGINT_ZERO) {
        throw new Error('Inverse exchange rate is below supported precision.');
    }

    return formatScaledDecimal(inverseUnits, EXCHANGE_RATE_FRACTION_DIGITS);
}

type ExchangeRateRatio = {
    denominator: bigint;
    numerator: bigint;
};

function parseExchangeRateRatio(exchangeRate: string): ExchangeRateRatio {
    const normalizedRate = normalizeExchangeRate(exchangeRate);

    if (normalizedRate === undefined) {
        throw new Error(`Invalid positive exchange rate: ${exchangeRate}`);
    }

    const [wholePart, fractionPart = ''] = normalizedRate.split('.');

    return {
        denominator: BIGINT_TEN ** BigInt(fractionPart.length),
        numerator: BigInt(`${wholePart}${fractionPart}`)
    };
}

function divideAndRound(numerator: bigint, denominator: bigint): bigint {
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;

    return remainder * BIGINT_TWO >= denominator
        ? quotient + BIGINT_ONE
        : quotient;
}

function formatScaledDecimal(value: bigint, fractionDigits: number): string {
    const scale = BIGINT_TEN ** BigInt(fractionDigits);
    const wholePart = value / scale;
    const fractionPart = (value % scale)
        .toString()
        .padStart(fractionDigits, '0')
        .replace(/0+$/, '');

    return fractionPart ? `${wholePart}.${fractionPart}` : wholePart.toString();
}
