import type { CurrencyCodeValue, FormatCurrencyOptions } from '~/shared/lib';
import { formatCurrency } from '~/shared/lib';

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

export function formatMinorUnitsAsInput(amountMinor: number): string {
    return minorUnitsToAmount(amountMinor).toFixed(2).replace('.', ',');
}

export function parseOptionalMoneyInputToMinorUnits(value: string): number | null | undefined {
    const normalizedValue = value.trim().replace(/\s/g, '').replace(',', '.');

    if (!normalizedValue) {
        return null;
    }

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
        return undefined;
    }

    const amount = Number(normalizedValue);

    if (!Number.isFinite(amount)) {
        return undefined;
    }

    return amountToMinorUnits(amount);
}
