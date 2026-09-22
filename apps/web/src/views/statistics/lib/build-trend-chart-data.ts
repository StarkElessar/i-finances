import type { MonthlyTrend } from '@/entities/operation';

import { minorUnitsToAmount } from '@/shared/lib';

import type { ChartData } from 'chart.js';

export type TrendChartColors = {
	expense: string;
	income: string;
};

export function formatMonthLabel(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	const date = new Date(year, month - 1, 1);
	const formatted = new Intl.DateTimeFormat('ru-BY', { month: 'short', year: 'numeric' }).format(date);

	return formatted.charAt(0).toLocaleUpperCase('ru-BY') + formatted.slice(1);
}

export function buildTrendChartData(trend: MonthlyTrend, colors: TrendChartColors): ChartData<'line'> {
	return {
		datasets: [
			{
				borderColor: colors.expense,
				data: trend.points.map((point) => minorUnitsToAmount(point.expenseMinor)),
				label: 'Расходы',
				tension: 0.25
			},
			{
				borderColor: colors.income,
				data: trend.points.map((point) => minorUnitsToAmount(point.incomeMinor)),
				label: 'Доходы',
				tension: 0.25
			}
		],
		labels: trend.points.map((point) => formatMonthLabel(point.month))
	};
}
