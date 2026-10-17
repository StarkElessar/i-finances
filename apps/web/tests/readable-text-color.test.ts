import { getReadableTextColor } from '@/shared/lib';

import { describe, expect, it } from 'vitest';

describe('getReadableTextColor', () => {
	it('uses white on dark account colours', () => {
		expect(getReadableTextColor('#3f77a8')).toBe('#ffffff');
		expect(getReadableTextColor('#7a0019')).toBe('#ffffff');
	});

	it('uses dark text on light account colours', () => {
		expect(getReadableTextColor('#fde68a')).toBe('#172033');
		expect(getReadableTextColor('#ffffff')).toBe('#172033');
	});

	it('falls back to white for malformed input', () => {
		expect(getReadableTextColor('nope')).toBe('#ffffff');
	});
});
