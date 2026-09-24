import css from './breakdown-chart.module.scss';

import { minorUnitsToAmount } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';
import { formatShortMonth } from '@/views/statistics/ui/breakdown-table/breakdown-table';

import { BarController, BarElement, CategoryScale, Chart, type ChartData, type ChartOptions, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'solid-chartjs';
import { createMemo, For, type JSX, onMount } from 'solid-js';

export type BreakdownChartProps = {
	colorOf: (id: string) => string;
	currentMonth: string;
	formatExact: (minor: number) => string;
	matrix: BreakdownMatrix;
	surfaceColor: string;
};

export function BreakdownChart(props: BreakdownChartProps): JSX.Element {
	const data = createMemo<ChartData<'bar'>>(() => ({
		datasets: props.matrix.series.map((series) => ({
			backgroundColor: props.colorOf(series.id),
			borderColor: props.surfaceColor,
			borderSkipped: false,
			borderWidth: { bottom: 0, left: 0, right: 0, top: 2 },
			data: series.values.map(minorUnitsToAmount),
			label: series.label,
			maxBarThickness: 46
		})),
		labels: props.matrix.months.map((month, index) => (
			month === props.currentMonth
				? [formatShortMonth(month, index === 0), 'неполный']
				: formatShortMonth(month, index === 0)
		))
	}));
	const options = createMemo<ChartOptions<'bar'>>(() => ({
		interaction: { intersect: false, mode: 'index' },
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					footer: (items) => `Итого: ${props.formatExact(props.matrix.colTotals[items[0]?.dataIndex ?? 0])}`,
					label: (item) => `${item.dataset.label ?? ''}: ${props.formatExact(Math.round(Number(item.raw) * 100))}`
				},
				filter: (item) => Number(item.raw) > 0
			}
		},
		responsive: true,
		scales: {
			x: { grid: { display: false }, stacked: true },
			y: { beginAtZero: true, stacked: true, ticks: { maxTicksLimit: 6 } }
		}
	}));

	onMount(() => {
		Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
	});

	return (
		<div class={css.root}>
			<ul class={css.legend}>
				<For each={props.matrix.series}>
					{(series) => (
						<li class={css.legendItem}>
							<span class={css.dot} style={{ 'background-color': props.colorOf(series.id) }}/>
							{series.label}
						</li>
					)}
				</For>
			</ul>
			<div class={css.canvas}>
				<Bar data={data()} options={options()}/>
			</div>
		</div>
	);
}
