import {
	CARD_NUMBER_DIGITS,
	formatCardNumberInput,
	formatCardNumberPreview,
	maskCardNumber,
	maskCardNumberShort
} from '@/shared/lib';

import { describe, expect, it } from 'vitest';

describe('card number formatting', () => {
	it('groups digits by four and caps at 16', () => {
		expect(CARD_NUMBER_DIGITS).toBe(16);
		expect(formatCardNumberInput('4')).toBe('4');
		expect(formatCardNumberInput('41111')).toBe('4111 1');
		expect(formatCardNumberInput('4111111111111111999')).toBe('4111 1111 1111 1111');
	});

	it('drops non-digits from pasted text', () => {
		expect(formatCardNumberInput('4111-1111 abc 1111')).toBe('4111 1111 1111');
	});

	it('preview pads missing digits with bullets', () => {
		expect(formatCardNumberPreview('')).toBe('•••• •••• •••• ••••');
		expect(formatCardNumberPreview('41111')).toBe('4111 1••• •••• ••••');
	});

	it('masks by last four', () => {
		expect(maskCardNumber('5678')).toBe('•••• •••• •••• 5678');
		expect(maskCardNumberShort('5678')).toBe('•••• 5678');
		expect(maskCardNumber(null)).toBe('');
		expect(maskCardNumberShort(null)).toBe('');
	});
});
