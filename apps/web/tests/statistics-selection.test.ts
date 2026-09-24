import {
	decodeSelectionParam,
	encodeSelectionParam,
	isAllSelected,
	sanitizeSelection,
	toggleAll,
	toggleOne
} from '@/views/statistics/lib/selection';
import { readStoredComparison, writeStoredComparison } from '@/views/statistics/lib/selection-storage';

import { describe, expect, it } from 'vitest';

const ALL = ['a', 'b', 'c'];

describe('«Все» selection', () => {
	it('selects everything from an empty or partial selection', () => {
		expect(toggleAll([], ALL)).toEqual(ALL);
		expect(toggleAll(['b'], ALL)).toEqual(ALL);
	});

	it('clears everything when all are selected', () => {
		expect(toggleAll(['c', 'a', 'b'], ALL)).toEqual([]);
	});

	it('derives «Все» from the selection: last item turns it on, removing one turns it off', () => {
		const almost = ['a', 'b'];

		expect(isAllSelected(almost, ALL)).toBe(false);
		expect(isAllSelected(toggleOne(almost, 'c'), ALL)).toBe(true);
		expect(isAllSelected(toggleOne(ALL, 'b'), ALL)).toBe(false);
	});

	it('is not «all» for an empty list of entities', () => {
		expect(isAllSelected([], [])).toBe(false);
	});
});

describe('selection param', () => {
	it('encodes a full selection as «all» and a partial one as ids', () => {
		expect(encodeSelectionParam(['c', 'a', 'b'], ALL)).toBe('all');
		expect(encodeSelectionParam(['a', 'c'], ALL)).toBe('a,c');
		expect(encodeSelectionParam([], ALL)).toBeUndefined();
	});

	it('decodes «all», drops unknown ids and treats absence as undefined', () => {
		expect(decodeSelectionParam('all', ALL)).toEqual(ALL);
		expect(decodeSelectionParam('a,zzz,c', ALL)).toEqual(['a', 'c']);
		expect(decodeSelectionParam(undefined, ALL)).toBeUndefined();
	});

	it('sanitizes against the current entity list and removes duplicates', () => {
		expect(sanitizeSelection(['a', 'a', 'x'], ALL)).toEqual(['a']);
	});
});

describe('selection storage', () => {
	it('round-trips ids and slots per dimension', () => {
		const data = new Map<string, string>();
		const storage = {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => {
				data.set(key, value);
			}
		};

		writeStoredComparison(storage, 'contact', { ids: ['a'], slots: { a: 3 } });

		expect(readStoredComparison(storage, 'contact')).toEqual({ ids: ['a'], slots: { a: 3 } });
		expect(readStoredComparison(storage, 'category')).toEqual({ ids: [], slots: {} });
	});

	it('survives garbage and throwing storage', () => {
		expect(readStoredComparison({ getItem: () => '{not json' }, 'category')).toEqual({ ids: [], slots: {} });
		expect(readStoredComparison({
			getItem: () => {
				throw new Error('blocked');
			}
		}, 'category')).toEqual({ ids: [], slots: {} });
		expect(() => writeStoredComparison({
			setItem: () => {
				throw new Error('quota');
			}
		}, 'category', { ids: [], slots: {} }))
			.not.toThrow();
	});
});
