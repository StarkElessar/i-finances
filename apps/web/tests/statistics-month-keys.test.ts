import { addMonths, countMonths, listMonthKeys } from '@/views/statistics/lib/month-keys';

import { describe, expect, it } from 'vitest';

describe('month keys', () => {
	it('adds months across year boundaries', () => {
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addMonths('2025-11', 3)).toBe('2026-02');
		expect(addMonths('2026-09', 0)).toBe('2026-09');
	});

	it('lists months inclusively in chronological order', () => {
		expect(listMonthKeys('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
		expect(listMonthKeys('2026-09', '2026-09')).toEqual(['2026-09']);
		expect(listMonthKeys('2026-09', '2026-01')).toEqual([]);
	});

	it('counts months inclusively', () => {
		expect(countMonths('2024-10', '2026-09')).toBe(24);
		expect(countMonths('2026-09', '2026-09')).toBe(1);
	});
});
