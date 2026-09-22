import type { Category } from '@/entities/category/model/types';
import type { CategoryStats, MonthlyTrend } from '@/entities/operation';

import { buildCategoryChartData } from '@/views/statistics/lib/build-category-chart-data';
import { buildTrendChartData, formatMonthLabel } from '@/views/statistics/lib/build-trend-chart-data';

import { describe, expect, it } from 'vitest';

function makeCategory(overrides: Partial<Category> = {}): Category {
	return {
		color: '#68a063',
		createdAt: '2026-01-01',
		description: '',
		icon: 'shopping-cart',
		id: 'category-food',
		keywords: [],
		monthlyBudgetMinor: null,
		name: 'Продукты',
		updatedAt: '2026-01-01',
		...overrides
	};
}

describe('buildCategoryChartData', () => {
	it('uses the budget-based delta when the category has a budget', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [{
				averageMinor: 30_000,
				categoryId: 'category-food',
				currentMinor: 45_000,
				deltaPercent: 50,
				monthsIncludedCount: 3
			}],
			month: '2026-09'
		};
		const categories = [makeCategory({ monthlyBudgetMinor: 50_000 })];

		const result = buildCategoryChartData(stats, categories);

		expect(result.deltas).toEqual([{
			categoryId: 'category-food',
			deltaPercent: -10,
			isSignificant: false,
			kind: 'budget',
			label: 'Продукты'
		}]);
		expect(result.data.labels).toEqual(['Продукты']);
		expect(result.data.datasets[0].backgroundColor).toEqual(['#68a063']);
	});

	it('falls back to the historical-average delta when there is no budget', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [{
				averageMinor: 15_000,
				categoryId: 'category-food',
				currentMinor: 45_000,
				deltaPercent: 200,
				monthsIncludedCount: 2
			}],
			month: '2026-09'
		};
		const categories = [makeCategory()];

		const result = buildCategoryChartData(stats, categories);

		expect(result.deltas).toEqual([{
			categoryId: 'category-food',
			deltaPercent: 200,
			isSignificant: true,
			kind: 'average',
			label: 'Продукты'
		}]);
	});

	it('sorts categories by current spend, descending', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [
				{ averageMinor: null, categoryId: 'category-small', currentMinor: 1_000, deltaPercent: null, monthsIncludedCount: 0 },
				{ averageMinor: null, categoryId: 'category-food', currentMinor: 45_000, deltaPercent: null, monthsIncludedCount: 0 }
			],
			month: '2026-09'
		};
		const categories = [
			makeCategory(),
			makeCategory({ color: '#a06368', id: 'category-small', name: 'Мелочи' })
		];

		const result = buildCategoryChartData(stats, categories);

		expect(result.data.labels).toEqual(['Продукты', 'Мелочи']);
	});
});

describe('buildTrendChartData', () => {
	it('builds two datasets in minor->major units with the given colors', () => {
		const trend: MonthlyTrend = {
			baseCurrency: 'BYN',
			points: [
				{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' },
				{ expenseMinor: 15_000, incomeMinor: 0, month: '2026-09' }
			]
		};

		const data = buildTrendChartData(trend, { expense: '#c82d4d', income: '#147a50' });

		expect(data.labels).toHaveLength(2);
		expect(data.datasets).toEqual([
			expect.objectContaining({ borderColor: '#c82d4d', data: [100, 150], label: 'Расходы' }),
			expect.objectContaining({ borderColor: '#147a50', data: [2_000, 0], label: 'Доходы' })
		]);
	});
});

describe('formatMonthLabel', () => {
	it('formats a YYYY-MM key as a short Russian month + year', () => {
		expect(formatMonthLabel('2026-01')).toBe('Янв. 2026 г.');
		expect(formatMonthLabel('2026-12')).toBe('Дек. 2026 г.');
	});
});
