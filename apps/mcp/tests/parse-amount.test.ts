import { parseAmountToMinor } from '@/parse-amount';

import { describe, expect, it } from 'vitest';

describe('parseAmountToMinor', () => {
	it('converts a plain integer amount', () => {
		expect(parseAmountToMinor('47')).toBe(4700);
	});

	it('converts a decimal amount', () => {
		expect(parseAmountToMinor('47.90')).toBe(4790);
	});

	it('accepts a comma decimal separator', () => {
		expect(parseAmountToMinor('47,9')).toBe(4790);
	});

	it('pads a single fractional digit', () => {
		expect(parseAmountToMinor('10.5')).toBe(1050);
	});

	it('truncates extra fractional digits', () => {
		expect(parseAmountToMinor('10.5678')).toBe(1056);
	});

	it('rejects a negative amount', () => {
		expect(() => parseAmountToMinor('-5')).toThrow('Invalid amount');
	});

	it('rejects a non-numeric amount', () => {
		expect(() => parseAmountToMinor('abc')).toThrow('Invalid amount');
	});
});
