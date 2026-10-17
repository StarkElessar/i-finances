/**
 * Keeps only decimal digits from a card number string.
 */
export function extractCardDigits(value: string): string {
	return value.replace(/\D/g, '');
}

/**
 * Luhn checksum over a string of digits (no spaces).
 */
export function isLuhnValid(digits: string): boolean {
	if (!/^\d+$/.test(digits)) {
		return false;
	}

	let sum = 0;
	let shouldDouble = false;

	for (let index = digits.length - 1; index >= 0; index -= 1) {
		let digit = Number(digits[index]);

		if (shouldDouble) {
			digit *= 2;

			if (digit > 9) {
				digit -= 9;
			}
		}

		sum += digit;
		shouldDouble = !shouldDouble;
	}

	return sum % 10 === 0;
}
