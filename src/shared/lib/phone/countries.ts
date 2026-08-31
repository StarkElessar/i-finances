import type { PhoneCountry, PhoneCountryCode } from './types';

/**
 * Default country when creating a new phone field.
 */
export const DEFAULT_PHONE_COUNTRY_CODE: PhoneCountryCode = 'by';

const PHONE_COUNTRIES = {
	by: {
		code: 'by',
		label: 'Беларусь (+375)',
		mask: '(99) 999-99-99',
		prefix: '+375'
	},
	ru: {
		code: 'ru',
		label: 'Россия (+7)',
		mask: '(999) 999-99-99',
		prefix: '+7'
	}
} as const satisfies Record<PhoneCountryCode, PhoneCountry>;

/**
 * Returns the registry of phone countries in stable UI order.
 */
export function listPhoneCountries(): readonly PhoneCountry[] {
	return [PHONE_COUNTRIES.by, PHONE_COUNTRIES.ru];
}

/**
 * Looks up one phone country by code.
 */
export function getPhoneCountry(code: PhoneCountryCode): PhoneCountry {
	return PHONE_COUNTRIES[code];
}
