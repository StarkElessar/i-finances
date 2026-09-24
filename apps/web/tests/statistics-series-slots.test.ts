import { assignSeriesSlots } from '@/views/statistics/lib/series-slots';

import { describe, expect, it } from 'vitest';

describe('assignSeriesSlots', () => {
	it('gives new series the lowest free slot', () => {
		expect(assignSeriesSlots(['a', 'b', 'c'], {})).toEqual({ a: 0, b: 1, c: 2 });
	});

	it('keeps an existing series on its slot when others leave', () => {
		const first = assignSeriesSlots(['a', 'b', 'c'], {});

		expect(assignSeriesSlots(['a', 'c'], first)).toEqual({ a: 0, c: 2 });
	});

	it('reuses a freed slot for a newcomer without repainting survivors', () => {
		expect(assignSeriesSlots(['a', 'c', 'd'], { a: 0, c: 2 })).toEqual({ a: 0, c: 2, d: 1 });
	});
});
