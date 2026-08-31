import { describe, expect, it } from 'vitest';

import {
	countMaskDigitSlots,
	DEFAULT_PHONE_COUNTRY_CODE,
	extractPhoneDigits,
	formatPhoneInput,
	getPhoneCountry,
	isPhoneComplete,
	isValidStoredPhone,
	listPhoneCountries,
	normalizePhoneForSave,
	parseStoredPhone,
	resolvePhoneCountry,
	sanitizeNationalPhoneDigits,
	toE164
} from '../../../src/shared/lib';

describe('phone countries', () => {
	it('lists BY and RU with expected prefixes and masks', () => {
		expect(listPhoneCountries().map((country) => country.code)).toEqual(['by', 'ru']);
		expect(getPhoneCountry('by')).toMatchObject({
			mask: '(99) 999-99-99',
			prefix: '+375'
		});
		expect(getPhoneCountry('ru')).toMatchObject({
			mask: '(999) 999-99-99',
			prefix: '+7'
		});
		expect(DEFAULT_PHONE_COUNTRY_CODE).toBe('by');
	});
});

describe('phone formatting', () => {
	it('extracts digits and formats BY / RU masks', () => {
		expect(extractPhoneDigits('(29) 726-68-21')).toBe('297266821');
		expect(extractPhoneDigits('(29)a726')).toBe('29726');
		expect(formatPhoneInput('297266821', getPhoneCountry('by'))).toBe('(29) 726-68-21');
		expect(formatPhoneInput('9431233223', getPhoneCountry('ru'))).toBe('(943) 123-32-23');
		expect(formatPhoneInput('29', getPhoneCountry('by'))).toBe('(29');
	});

	it('ignores overflow digits beyond the mask length', () => {
		const by = getPhoneCountry('by');
		const capped = extractPhoneDigits('297266821999').slice(0, countMaskDigitSlots(by.mask));

		expect(formatPhoneInput(capped, by)).toBe('(29) 726-68-21');
	});

	it('strips a matching country prefix from pasted input', () => {
		const by = getPhoneCountry('by');
		const ru = getPhoneCountry('ru');

		expect(sanitizeNationalPhoneDigits('+375297266821', by)).toBe('297266821');
		expect(sanitizeNationalPhoneDigits('+79431233223', ru)).toBe('9431233223');
		expect(sanitizeNationalPhoneDigits('(29) 726-68-21', by)).toBe('297266821');
	});

	it('detects complete national numbers', () => {
		expect(isPhoneComplete('297266821', getPhoneCountry('by'))).toBe(true);
		expect(isPhoneComplete('29726682', getPhoneCountry('by'))).toBe(false);
		expect(isPhoneComplete('9431233223', getPhoneCountry('ru'))).toBe(true);
	});

	it('builds E.164 from complete national digits', () => {
		expect(toE164('297266821', getPhoneCountry('by'))).toBe('+375297266821');
		expect(toE164('9431233223', getPhoneCountry('ru'))).toBe('+79431233223');
	});
});

describe('stored phone parsing', () => {
	it('resolves country by longest matching prefix', () => {
		expect(resolvePhoneCountry('+375297266821')).toBe('by');
		expect(resolvePhoneCountry('+79431233223')).toBe('ru');
		expect(resolvePhoneCountry('+123')).toBe('by');
	});

	it('parses stored E.164 into country, digits and display', () => {
		expect(parseStoredPhone('+375297266821')).toEqual({
			countryCode: 'by',
			digits: '297266821',
			display: '(29) 726-68-21'
		});
		expect(parseStoredPhone(null)).toEqual({
			countryCode: 'by',
			digits: '',
			display: ''
		});
	});

	it('validates stored phone strings', () => {
		expect(isValidStoredPhone('+375297266821')).toBe(true);
		expect(isValidStoredPhone('+37512')).toBe(false);
		expect(isValidStoredPhone('+79431233223')).toBe(true);
		expect(isValidStoredPhone('297266821')).toBe(false);
	});
});

describe('normalizePhoneForSave', () => {
	it('maps empty to null, rejects partial, accepts complete', () => {
		expect(normalizePhoneForSave('', 'by')).toEqual({
			ok: true,
			phone: null
		});
		expect(normalizePhoneForSave('   ', 'by')).toEqual({
			ok: true,
			phone: null
		});
		expect(normalizePhoneForSave('(29) 726', 'by')).toEqual({
			ok: false,
			message: 'Введите номер полностью.'
		});
		expect(normalizePhoneForSave('(29) 726-68-21', 'by')).toEqual({
			ok: true,
			phone: '+375297266821'
		});
	});
});
