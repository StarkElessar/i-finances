import { formatCardExpiryInput, isCardExpired } from '@/shared/lib';

import { describe, expect, it } from 'vitest';

describe('card expiry mask', () => {
	it('inserts the slash after two digits', () => {
		expect(formatCardExpiryInput('0')).toBe('0');
		expect(formatCardExpiryInput('08')).toBe('08/');
		expect(formatCardExpiryInput('082')).toBe('08/2');
		expect(formatCardExpiryInput('0827')).toBe('08/27');
		expect(formatCardExpiryInput('082799')).toBe('08/27');
	});

	it('pads a first digit from 2 to 9 with zero', () => {
		expect(formatCardExpiryInput('5')).toBe('05/');
		expect(formatCardExpiryInput('1')).toBe('1');
	});

	it('lets the user delete the slash', () => {
		expect(formatCardExpiryInput('08', '08/')).toBe('08');
		expect(formatCardExpiryInput('08/2x', '08/')).toBe('08/2');
	});
});

describe('isCardExpired', () => {
	it('stays valid through the last day of the expiry month', () => {
		expect(isCardExpired('08/27', new Date(2027, 7, 31))).toBe(false);
	});

	it('is expired from the first day of the next month', () => {
		expect(isCardExpired('08/27', new Date(2027, 8, 1))).toBe(true);
	});

	it('ignores malformed values', () => {
		expect(isCardExpired('', new Date(2030, 0, 1))).toBe(false);
		expect(isCardExpired('13/27', new Date(2030, 0, 1))).toBe(false);
	});
});
