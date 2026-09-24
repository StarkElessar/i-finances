import type { MonthlyBreakdownCell } from '@/entities/operation';

import { listMonthKeys } from './month-keys';
import { SERIES_SLOT_COUNT } from './series-slots';

export const OTHER_SERIES_ID = '__other__';

export type BreakdownReference = {
	budgetMinor: number | null;
	id: string;
	isArchived: boolean;
	name: string;
};

export type BreakdownRow = BreakdownReference & {
	avgMinor: number | null;
	totalMinor: number;
	values: number[];
};

export type BreakdownSeries = {
	id: string;
	label: string;
	values: number[];
};

export type BreakdownMatrix = {
	avgMinor: number | null;
	colTotals: number[];
	folded: BreakdownRow[];
	hiddenZeroCount: number;
	months: string[];
	rows: BreakdownRow[];
	series: BreakdownSeries[];
	totalMinor: number;
};

export type BuildBreakdownMatrixInput = {
	cells: readonly MonthlyBreakdownCell[];
	currentMonth: string;
	from: string;
	references: readonly BreakdownReference[];
	selectedIds: readonly string[];
	to: string;
};

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function averageOverClosedMonths(values: readonly number[], months: readonly string[], currentMonth: string): number | null {
	const closed = values.filter((_, index) => months[index] < currentMonth);

	return closed.length > 0 ? Math.round(sum(closed) / closed.length) : null;
}

export function buildBreakdownMatrix(input: BuildBreakdownMatrixInput): BreakdownMatrix {
	const months = listMonthKeys(input.from, input.to);
	const monthIndex = new Map(months.map((month, index) => [month, index]));
	const referencesById = new Map(input.references.map((reference) => [reference.id, reference]));
	const valuesById = new Map<string, number[]>();

	for (const cell of input.cells) {
		const index = monthIndex.get(cell.month);

		if (index === undefined) {
			continue;
		}

		const values = valuesById.get(cell.referenceId) ?? months.map(() => 0);

		values[index] += cell.totalMinor;
		valuesById.set(cell.referenceId, values);
	}

	const selectedRows = input.selectedIds.flatMap((id) => {
		const reference = referencesById.get(id);

		if (reference === undefined) {
			return [];
		}

		const values = valuesById.get(id) ?? months.map(() => 0);

		return [{
			...reference,
			avgMinor: averageOverClosedMonths(values, months, input.currentMonth),
			totalMinor: sum(values),
			values
		}];
	});
	const rows = selectedRows
		.filter((row) => row.totalMinor > 0)
		.toSorted((left, right) => right.totalMinor - left.totalMinor);
	const charted = rows.length <= SERIES_SLOT_COUNT ? rows : rows.slice(0, SERIES_SLOT_COUNT - 1);
	const folded = rows.slice(charted.length);
	const series: BreakdownSeries[] = charted.map((row) => ({ id: row.id, label: row.name, values: row.values }));

	if (folded.length > 0) {
		series.push({
			id: OTHER_SERIES_ID,
			label: `Остальные (${folded.length})`,
			values: months.map((_, index) => sum(folded.map((row) => row.values[index])))
		});
	}

	const colTotals = months.map((_, index) => sum(rows.map((row) => row.values[index])));

	return {
		avgMinor: averageOverClosedMonths(colTotals, months, input.currentMonth),
		colTotals,
		folded,
		hiddenZeroCount: selectedRows.length - rows.length,
		months,
		rows,
		series,
		totalMinor: sum(colTotals)
	};
}
