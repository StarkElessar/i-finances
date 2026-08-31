import { DEFAULT_PHONE_COUNTRY_CODE, getPhoneCountry, listPhoneCountries } from './countries';
import type { ParsedStoredPhone, PhoneCountry, PhoneCountryCode } from './types';

/**
 * Counts digit slots (`9`) in a mask pattern.
 */
export function countMaskDigitSlots(mask: string): number {
	let count = 0;

	for (const char of mask) {
		if (char === '9') {
			count += 1;
		}
	}

	return count;
}

/**
 * Keeps only decimal digits from a phone input string.
 */
export function extractPhoneDigits(input: string): string {
	return input.replace(/\D/g, '');
}

/**
 * Turns raw/pasted input into national digits for the selected country mask.
 * Strips a matching country prefix (e.g. pasted `+375…`) and caps length.
 */
export function sanitizeNationalPhoneDigits(
	rawValue: string,
	country: PhoneCountry
): string {
	let digits = extractPhoneDigits(rawValue);
	const prefixDigits = extractPhoneDigits(country.prefix);

	if (
		prefixDigits.length > 0
		&& digits.startsWith(prefixDigits)
		&& digits.length > prefixDigits.length
	) {
		digits = digits.slice(prefixDigits.length);
	}

	return digits.slice(0, countMaskDigitSlots(country.mask));
}

/**
 * Formats national digits into the country mask (partial-friendly).
 */
export function formatPhoneInput(digits: string, country: PhoneCountry): string {
	let digitIndex = 0;
	let result = '';

	for (const char of country.mask) {
		if (digitIndex >= digits.length) {
			break;
		}

		if (char === '9') {
			result += digits[digitIndex];
			digitIndex += 1;
			continue;
		}

		result += char;
	}

	return result;
}

/**
 * Whether national digits fill every slot of the country mask.
 */
export function isPhoneComplete(digits: string, country: PhoneCountry): boolean {
	return digits.length === countMaskDigitSlots(country.mask);
}

/**
 * Builds an E.164-like string from complete national digits.
 * @throws If digits do not complete the country mask.
 */
export function toE164(digits: string, country: PhoneCountry): string {
	if (!isPhoneComplete(digits, country)) {
		throw new Error(`Incomplete phone digits for ${country.code}`);
	}

	return `${country.prefix}${digits}`;
}

/**
 * Picks a registry country by longest matching prefix; falls back to BY.
 */
export function resolvePhoneCountry(e164: string): PhoneCountryCode {
	const countries = [...listPhoneCountries()].sort(
		(left, right) => right.prefix.length - left.prefix.length
	);

	for (const country of countries) {
		if (e164.startsWith(country.prefix)) {
			return country.code;
		}
	}

	return DEFAULT_PHONE_COUNTRY_CODE;
}

/**
 * Splits a stored phone into country + national display parts for the form.
 */
export function parseStoredPhone(e164: string | null): ParsedStoredPhone {
	if (e164 === null || e164.trim().length === 0) {
		return {
			countryCode: DEFAULT_PHONE_COUNTRY_CODE,
			digits: '',
			display: ''
		};
	}

	const countryCode = resolvePhoneCountry(e164);
	const country = getPhoneCountry(countryCode);

	if (!e164.startsWith(country.prefix)) {
		return {
			countryCode: DEFAULT_PHONE_COUNTRY_CODE,
			digits: '',
			display: ''
		};
	}

	const digits = e164.slice(country.prefix.length);

	if (!/^\d+$/.test(digits) || !isPhoneComplete(digits, country)) {
		return {
			countryCode: DEFAULT_PHONE_COUNTRY_CODE,
			digits: '',
			display: ''
		};
	}

	return {
		countryCode,
		digits,
		display: formatPhoneInput(digits, country)
	};
}

/**
 * Whether a stored E.164 string matches a registry country exactly.
 */
export function isValidStoredPhone(value: string): boolean {
	const countryCode = resolvePhoneCountry(value);
	const country = getPhoneCountry(countryCode);

	if (!value.startsWith(country.prefix)) {
		return false;
	}

	const digits = value.slice(country.prefix.length);
	return /^\d+$/.test(digits) && isPhoneComplete(digits, country);
}
