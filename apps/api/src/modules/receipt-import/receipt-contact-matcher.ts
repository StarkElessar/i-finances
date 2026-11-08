import { normalizeContactIdentity, type ReceiptContactSnapshot } from '@i-finances/contracts';

/**
 * Legal-form markers that appear on a receipt but are rarely part of the name a contact is saved
 * under: `ООО "Либретик"` is the contact «Либретик».
 */
const LEGAL_FORM_TOKENS = new Set([
	'ао',
	'ип',
	'llc',
	'ltd',
	'одо',
	'оао',
	'ооо',
	'тоо',
	'уп',
	'чуп',
	'чтуп',
	'зао'
]);

export type ReceiptMerchantNames = {
	displayName: string | null;
	legalName: string | null;
};

/**
 * Reduces a shop name to the words that identify it: case, `ё`, quotes, punctuation and legal-form
 * markers are dropped so that `ООО "Либретик"`, `«ЛИБРЕТИК»` and `Либретик` compare equal.
 */
export function normalizeMerchantName(value: string): string {
	return normalizeContactIdentity(value)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((token) => token.length > 0 && !LEGAL_FORM_TOKENS.has(token))
		.join(' ');
}

/**
 * Finds the contact a receipt's seller belongs to by comparing the seller names the model read from
 * the photo with the contacts' names and legal names. It is a safety net behind the model's own
 * guess, so it is deliberately strict: an exact match after normalization and exactly one candidate,
 * because a wrongly pre-selected payee is worse than an empty select.
 *
 * @returns the id of the single matching contact, or `null` when there is none or it is ambiguous.
 */
export function matchReceiptContact(
	merchant: ReceiptMerchantNames,
	contacts: readonly ReceiptContactSnapshot[]
): string | null {
	const merchantKeys = new Set(
		[merchant.displayName, merchant.legalName]
			.map((name) => (name === null ? '' : normalizeMerchantName(name)))
			.filter((key) => key.length > 0)
	);

	if (merchantKeys.size === 0) {
		return null;
	}

	const matches = contacts.filter((contact) => (
		[contact.name, contact.legalName].some((name) => (
			typeof name === 'string' && merchantKeys.has(normalizeMerchantName(name))
		))
	));

	return matches.length === 1 ? matches[0].id : null;
}
