import css from './monthly-trend-chart.module.scss';

import type { ChartData } from 'chart.js';
import {
	CategoryScale,
	Chart,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	Tooltip
} from 'chart.js';
import { Line } from 'solid-chartjs';
import { onMount } from 'solid-js';

export type MonthlyTrendChartProps = {
	data: ChartData<'line'>;
};

export function MonthlyTrendChart(props: MonthlyTrendChartProps) {
	onMount(() => {
		Chart.register(
			CategoryScale,
			LinearScale,
			LineController,
			LineElement,
			PointElement,
			Legend,
			Tooltip
		);
	});

	return (
		<div class={css.canvas}>
			<Line
				data={props.data}
				options={{
					maintainAspectRatio: false,
					plugins: { legend: { position: 'top' } },
					responsive: true
				}}
			/>
		</div>
	);
}
