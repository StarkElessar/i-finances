import {
	DEFAULT_OPERATION_SORT,
	getSortOrderLabel,
	isCustomSortOrder,
	OPERATION_SORT_ORDER_OPTIONS,
	parseSortOrderValue,
	toSortOrderValue
} from '@/views/home/ui/operations-workspace/lib/operation-sort-order';

import { describe, expect, it } from 'vitest';

describe('operation sort order options', () => {
	it('lists ten items, the default order first and every field in both directions', () => {
		expect(OPERATION_SORT_ORDER_OPTIONS).toHaveLength(10);
		expect(OPERATION_SORT_ORDER_OPTIONS[0].sort).toEqual(DEFAULT_OPERATION_SORT);
		expect(new Set(OPERATION_SORT_ORDER_OPTIONS.map((option) => option.value)).size).toBe(10);
	});

	it('sets both the field and the direction when an item is picked', () => {
		expect(parseSortOrderValue('amount:desc')).toEqual({ direction: 'desc', field: 'amount' });
		expect(parseSortOrderValue('contact:asc')).toEqual({ direction: 'asc', field: 'contact' });
		expect(parseSortOrderValue('amount:sideways')).toBeUndefined();
	});

	it('reflects the sort state after the field changes elsewhere (a column header click)', () => {
		const afterHeaderClick = { direction: 'asc', field: 'category' } as const;

		expect(toSortOrderValue(afterHeaderClick)).toBe('category:asc');
		expect(getSortOrderLabel(afterHeaderClick)).toBe('Категория, А–Я');
		expect(OPERATION_SORT_ORDER_OPTIONS.some((option) => option.value === toSortOrderValue(afterHeaderClick))).toBe(true);
	});

	it('marks only an order other than "date, newest first" as custom', () => {
		expect(isCustomSortOrder(DEFAULT_OPERATION_SORT)).toBe(false);
		expect(isCustomSortOrder({ direction: 'asc', field: 'date' })).toBe(true);
		expect(isCustomSortOrder({ direction: 'desc', field: 'amount' })).toBe(true);
	});
});
