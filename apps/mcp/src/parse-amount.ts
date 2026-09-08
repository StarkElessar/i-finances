/**
 * Converts a decimal amount string to minor units without floating-point
 * error, by parsing the integer and fractional parts separately.
 */
export function parseAmountToMinor(amount: string): number {
	const normalized = amount.trim().replace(',', '.');
	const [integerPart, fractionPart = ''] = normalized.split('.');
	const integer = parseInt(integerPart, 10);

	if (isNaN(integer) || integer < 0) {
		throw new Error(`Invalid amount: "${amount}"`);
	}

	const cents = parseInt((fractionPart + '00').slice(0, 2), 10);

	return integer * 100 + cents;
}
