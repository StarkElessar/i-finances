/**
 * ISO-like country codes supported by the phone registry.
 */
export type PhoneCountryCode = 'by' | 'ru';

/**
 * One country entry in the scalable phone-mask registry.
 */
export type PhoneCountry = {
	code: PhoneCountryCode;
	label: string;
	mask: string;
	prefix: string;
};

/**
 * Parsed view of a stored E.164 phone for form controls.
 */
export type ParsedStoredPhone = {
	countryCode: PhoneCountryCode;
	digits: string;
	display: string;
};

/**
 * Result of normalizing a masked phone input for persistence.
 */
export type NormalizePhoneForSaveResult =
	| {
		ok: true;
		phone: string | null;
	}
	| {
		message: string;
		ok: false;
	};
