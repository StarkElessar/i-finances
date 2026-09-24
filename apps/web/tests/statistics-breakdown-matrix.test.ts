import { type BreakdownReference, buildBreakdownMatrix, OTHER_SERIES_ID } from '@/views/statistics/lib/build-breakdown-matrix';

import { describe, expect, it } from 'vitest';

function reference(id: string, budgetMinor: number | null = null): BreakdownReference {
	return { budgetMinor, id, isArchived: false, name: id };
}

describe('buildBreakdownMatrix', () => {
	it('builds rows per month, sorted by total, with column totals', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-07', referenceId: 'food', totalMinor: 10_000 },
				{ month: '2026-08', referenceId: 'food', totalMinor: 20_000 },
				{ month: '2026-08', referenceId: 'sweets', totalMinor: 50_000 }
			],
			currentMonth: '2026-09',
			from: '2026-07',
			references: [reference('food', 15_000), reference('sweets')],
			selectedIds: ['food', 'sweets'],
			to: '2026-09'
		});

		expect(matrix.months).toEqual(['2026-07', '2026-08', '2026-09']);
		expect(matrix.rows.map((row) => row.id)).toEqual(['sweets', 'food']);
		expect(matrix.rows[1]).toMatchObject({ budgetMinor: 15_000, totalMinor: 30_000, values: [10_000, 20_000, 0] });
		expect(matrix.colTotals).toEqual([10_000, 70_000, 0]);
		expect(matrix.totalMinor).toBe(80_000);
	});

	it('averages over closed months only, excluding the current month', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-07', referenceId: 'food', totalMinor: 10_000 },
				{ month: '2026-08', referenceId: 'food', totalMinor: 30_000 },
				{ month: '2026-09', referenceId: 'food', totalMinor: 1_000 }
			],
			currentMonth: '2026-09',
			from: '2026-07',
			references: [reference('food')],
			selectedIds: ['food'],
			to: '2026-09'
		});

		expect(matrix.rows[0].avgMinor).toBe(20_000);
		expect(matrix.avgMinor).toBe(20_000);
	});

	it('returns null averages when the range holds only the current month', () => {
		const matrix = buildBreakdownMatrix({
			cells: [{ month: '2026-09', referenceId: 'food', totalMinor: 1_000 }],
			currentMonth: '2026-09',
			from: '2026-09',
			references: [reference('food')],
			selectedIds: ['food'],
			to: '2026-09'
		});

		expect(matrix.rows[0].avgMinor).toBeNull();
		expect(matrix.avgMinor).toBeNull();
	});

	it('hides selected rows with no spending and counts them', () => {
		const matrix = buildBreakdownMatrix({
			cells: [{ month: '2026-08', referenceId: 'food', totalMinor: 1_000 }],
			currentMonth: '2026-09',
			from: '2026-08',
			references: [reference('food'), reference('taxes')],
			selectedIds: ['food', 'taxes'],
			to: '2026-09'
		});

		expect(matrix.rows.map((row) => row.id)).toEqual(['food']);
		expect(matrix.hiddenZeroCount).toBe(1);
	});

	it('ignores cells of unselected references and unknown ids', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-08', referenceId: 'food', totalMinor: 1_000 },
				{ month: '2026-08', referenceId: 'sweets', totalMinor: 9_000 }
			],
			currentMonth: '2026-09',
			from: '2026-08',
			references: [reference('food'), reference('sweets')],
			selectedIds: ['food', 'deleted-category'],
			to: '2026-09'
		});

		expect(matrix.rows.map((row) => row.id)).toEqual(['food']);
		expect(matrix.totalMinor).toBe(1_000);
	});

	it('charts up to 8 rows as-is and folds the tail beyond 7 into «Остальные»', () => {
		const ids = Array.from({ length: 10 }, (_, index) => `r${index}`);
		const matrix = buildBreakdownMatrix({
			cells: ids.map((id, index) => ({ month: '2026-08', referenceId: id, totalMinor: (10 - index) * 1_000 })),
			currentMonth: '2026-09',
			from: '2026-08',
			references: ids.map((id) => reference(id)),
			selectedIds: ids,
			to: '2026-08'
		});

		expect(matrix.series).toHaveLength(8);
		expect(matrix.series.slice(0, 7).map((series) => series.id)).toEqual(ids.slice(0, 7));
		expect(matrix.series[7]).toEqual({ id: OTHER_SERIES_ID, label: 'Остальные (3)', values: [6_000] });
		expect(matrix.folded.map((row) => row.id)).toEqual(['r7', 'r8', 'r9']);
		expect(matrix.colTotals).toEqual([55_000]);
	});

	it('does not fold when exactly 8 rows are selected', () => {
		const ids = Array.from({ length: 8 }, (_, index) => `r${index}`);
		const matrix = buildBreakdownMatrix({
			cells: ids.map((id) => ({ month: '2026-08', referenceId: id, totalMinor: 1_000 })),
			currentMonth: '2026-09',
			from: '2026-08',
			references: ids.map((id) => reference(id)),
			selectedIds: ids,
			to: '2026-08'
		});

		expect(matrix.series).toHaveLength(8);
		expect(matrix.folded).toEqual([]);
	});
});
