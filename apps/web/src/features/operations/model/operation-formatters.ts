import type { OperationType } from '@i-finances/contracts';

export function formatOperationAmount(
	amountMinor: number,
	currency: string,
	type: OperationType
): string {
	const sign = type === 'expense' ? '−' : '+';

	return `${sign}${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export function formatMinorUnits(value: number): string {
	return (value / 100).toFixed(2);
}
