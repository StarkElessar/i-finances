const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/(\d{2})$/;

/**
 * Formats raw input as `MM/YY`. `previous` is the value before the edit and
 * lets the user delete the slash without it being re-inserted.
 */
export function formatCardExpiryInput(raw: string, previous = ''): string {
	let digits = raw.replace(/\D/g, '').slice(0, 4);

	if (digits.length === 1 && Number(digits) > 1) {
		digits = `0${digits}`;
	}

	if (digits.length < 2) {
		return digits;
	}

	const month = digits.slice(0, 2);

	if (digits.length === 2) {
		return raw.length < previous.length ? month : `${month}/`;
	}

	return `${month}/${digits.slice(2)}`;
}

/**
 * A card is valid through the last day of the printed month.
 */
export function isCardExpired(expiry: string, today: Date): boolean {
	const match = EXPIRY_PATTERN.exec(expiry);

	if (match === null) {
		return false;
	}

	const expiryMonthIndex = (2000 + Number(match[2])) * 12 + Number(match[1]);
	const currentMonthIndex = today.getFullYear() * 12 + today.getMonth() + 1;

	return currentMonthIndex > expiryMonthIndex;
}
