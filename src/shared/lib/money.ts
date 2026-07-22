import type { CurrencyCodeValue } from './currency-code';
import type { FormatCurrencyOptions } from './currency-formatter';
import { formatCurrency } from './currency-formatter';

const MINOR_UNITS_IN_MAJOR = 100;

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
