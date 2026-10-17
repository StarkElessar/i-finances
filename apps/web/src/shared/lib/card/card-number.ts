import { extractCardDigits } from '@i-finances/contracts';

export const CARD_NUMBER_DIGITS = 16;

function groupByFour(value: string): string {
	return value.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Keeps up to 16 digits from raw/pasted input and groups them by four.
 */
export function formatCardNumberInput(raw: string): string {
	return groupByFour(extractCardDigits(raw).slice(0, CARD_NUMBER_DIGITS));
}

/**
 * Always renders 16 positions, filling the missing ones with bullets (card preview).
 */
export function formatCardNumberPreview(digits: string): string {
	const filled = digits.slice(0, CARD_NUMBER_DIGITS).padEnd(CARD_NUMBER_DIGITS, '•');

	return groupByFour(filled);
}

export function maskCardNumber(last4: string | null): string {
	return last4 === null ? '' : `•••• •••• •••• ${last4}`;
}

export function maskCardNumberShort(last4: string | null): string {
	return last4 === null ? '' : `•••• ${last4}`;
}
