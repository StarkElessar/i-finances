import { minorUnitsToAmount } from '@/shared/lib';

import { getCategoryBudgetSummary } from '@/entities/category/model/selectors';
import type { Category } from '@/entities/category/model/types';
import type { CategoryStats } from '@/entities/operation';

import type { ChartData } from 'chart.js';

const SIGNIFICANT_DELTA_THRESHOLD_PERCENT = 20;
const UNCATEGORIZED_LABEL = 'Без категории';
const UNCATEGORIZED_COLOR = '#94a3b8';

export type CategoryChartDeltaKind = 'average' | 'budget';

export type CategoryChartDelta = {
	categoryId: string;
	deltaPercent: number | null;
	isSignificant: boolean;
	kind: CategoryChartDeltaKind;
	label: string;
};

export type CategoryChartResult = {
	data: ChartData<'bar'>;
	deltas: CategoryChartDelta[];
};

function isSignificantDelta(deltaPercent: number | null): boolean {
	return deltaPercent !== null && Math.abs(deltaPercent) >= SIGNIFICANT_DELTA_THRESHOLD_PERCENT;
}

export function buildCategoryChartData(
	stats: CategoryStats,
	categories: readonly Category[]
): CategoryChartResult {
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	const sortedItems = stats.items.toSorted((left, right) => right.currentMinor - left.currentMinor);

	const labels: string[] = [];
	const backgroundColors: string[] = [];
	const amounts: number[] = [];
	const deltas: CategoryChartDelta[] = [];

	for (const item of sortedItems) {
		const category = categoriesById.get(item.categoryId);
		const label = category?.name ?? UNCATEGORIZED_LABEL;

		labels.push(label);
		amounts.push(minorUnitsToAmount(item.currentMinor));
		backgroundColors.push(category?.color ?? UNCATEGORIZED_COLOR);

		const budgetSummary = category === undefined
			? undefined
			: getCategoryBudgetSummary(category, item.currentMinor);

		if (budgetSummary?.hasBudget) {
			const deltaPercent = budgetSummary.usagePercent === null
				? null
				: budgetSummary.usagePercent - 100;

			deltas.push({
				categoryId: item.categoryId,
				deltaPercent,
				isSignificant: isSignificantDelta(deltaPercent),
				kind: 'budget',
				label
			});
		}
		else {
			deltas.push({
				categoryId: item.categoryId,
				deltaPercent: item.deltaPercent,
				isSignificant: isSignificantDelta(item.deltaPercent),
				kind: 'average',
				label
			});
		}
	}

	return {
		data: {
			datasets: [{
				backgroundColor: backgroundColors,
				data: amounts,
				label: 'Расходы за месяц'
			}],
			labels
		},
		deltas
	};
}
