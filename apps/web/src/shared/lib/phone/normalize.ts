import { getPhoneCountry } from './countries';
import {
	extractPhoneDigits,
	isPhoneComplete,
	toE164
} from './format';
import type { NormalizePhoneForSaveResult, PhoneCountryCode } from './types';

/**
 * Normalizes a masked national phone input for create/update payloads.
 */
export function normalizePhoneForSave(
	displayOrEmpty: string,
	countryCode: PhoneCountryCode
): NormalizePhoneForSaveResult {
	const digits = extractPhoneDigits(displayOrEmpty);

	if (digits.length === 0) {
		return {
			ok: true,
			phone: null
		};
	}

	const country = getPhoneCountry(countryCode);

	if (!isPhoneComplete(digits, country)) {
		return {
			message: 'Введите номер полностью.',
			ok: false
		};
	}

	return {
		ok: true,
		phone: toE164(digits, country)
	};
}
