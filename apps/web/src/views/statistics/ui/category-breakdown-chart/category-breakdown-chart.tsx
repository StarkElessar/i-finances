import css from './category-breakdown-chart.module.scss';

import { cn } from '@/shared/lib';

import type { CategoryChartResult } from '@/views/statistics/lib/build-category-chart-data';

import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { TrendingDown, TrendingUp } from 'lucide-solid';
import { Bar } from 'solid-chartjs';
import { For, onMount, Show } from 'solid-js';

export type CategoryBreakdownChartProps = {
	result: CategoryChartResult;
};

function formatDeltaLabel(deltaPercent: number | null, kind: 'average' | 'budget'): string {
	if (deltaPercent === null) {
		return kind === 'budget' ? 'Бюджет не задан' : 'Нет истории для сравнения';
	}

	const sign = deltaPercent > 0 ? '+' : '';
	const suffix = kind === 'budget' ? 'к бюджету' : 'к среднему';

	return `${sign}${deltaPercent}% ${suffix}`;
}

export function CategoryBreakdownChart(props: CategoryBreakdownChartProps) {
	onMount(() => {
		Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
	});

	return (
		<div class={css.root}>
			<div class={css.canvas}>
				<Bar
					data={props.result.data}
					options={{
						maintainAspectRatio: false,
						plugins: { legend: { display: false } },
						responsive: true
					}}
				/>
			</div>
			<ul class={css.legend}>
				<For each={props.result.deltas}>
					{(delta, index) => (
						<li class={css.legendRow}>
							<span
								class={css.swatch}
								style={{
									'background-color': (props.result.data.datasets[0]?.backgroundColor as readonly string[] | undefined)
										?.[index()]
								}}
							/>
							<span class={css.name}>{delta.label}</span>
							<Show when={delta.isSignificant}>
								{delta.deltaPercent !== null && delta.deltaPercent > 0
									? <TrendingUp aria-hidden='true' size={16}/>
									: <TrendingDown aria-hidden='true' size={16}/>}
							</Show>
							<span
								class={cn(
									css.delta,
									delta.isSignificant && delta.deltaPercent !== null && delta.deltaPercent > 0 && css.deltaUp,
									delta.isSignificant && delta.deltaPercent !== null && delta.deltaPercent < 0 && css.deltaDown
								)}
							>
								{formatDeltaLabel(delta.deltaPercent, delta.kind)}
							</span>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}
