import { amountToMinorUnits, minorUnitsToAmount } from '~/shared/lib';

export { amountToMinorUnits, formatMinorUnitsCurrency, minorUnitsToAmount } from '~/shared/lib';

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
