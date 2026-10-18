import { ProcessedUpdateIds } from '@/modules/telegram';

import { describe, expect, it } from 'vitest';

describe('ProcessedUpdateIds', () => {
	it('reports an id as new once and as a repeat afterwards', () => {
		const ids = new ProcessedUpdateIds();

		expect(ids.markIfNew(1)).toBe(true);
		expect(ids.markIfNew(1)).toBe(false);
		expect(ids.markIfNew(2)).toBe(true);
	});

	it('forgets the oldest ids once the capacity is exceeded, and only those', () => {
		const ids = new ProcessedUpdateIds(3);

		[1, 2, 3, 4].forEach((id) => ids.markIfNew(id));

		expect(ids.markIfNew(4)).toBe(false);
		expect(ids.markIfNew(3)).toBe(false);
		expect(ids.markIfNew(2)).toBe(false);
		// 1 was evicted by 4: it counts as new again (and evicts 2 in turn).
		expect(ids.markIfNew(1)).toBe(true);
	});

	it('never grows beyond its capacity', () => {
		const ids = new ProcessedUpdateIds(100);

		for (let id = 0; id < 10_000; id += 1) {
			ids.markIfNew(id);
		}

		expect(ids.markIfNew(9_999)).toBe(false);
		expect(ids.markIfNew(9_899)).toBe(true);
		expect(ids.markIfNew(0)).toBe(true);
	});

	it.each([0, -1, 1.5, Number.NaN])('rejects the capacity %s', (capacity) => {
		expect(() => new ProcessedUpdateIds(capacity)).toThrow(RangeError);
	});
});
