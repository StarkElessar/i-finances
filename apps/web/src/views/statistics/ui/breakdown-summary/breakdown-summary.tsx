import css from './breakdown-summary.module.scss';

import { cn } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';

import { createMemo, type JSX, Show } from 'solid-js';

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTH_GENITIVE = [
	'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
	'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

function monthIndex(monthKey: string): number {
	return Number(monthKey.slice(5)) - 1;
}

export type BreakdownSummaryProps = {
	currentMonth: string;
	formatAmount: (minor: number) => string;
	matrix: BreakdownMatrix;
};

export function BreakdownSummary(props: BreakdownSummaryProps): JSX.Element {
	const lastClosedIndex = createMemo(() => props.matrix.months.findLastIndex((month) => month < props.currentMonth));
	const delta = createMemo(() => {
		const last = lastClosedIndex();

		if (last < 1) {
			return undefined;
		}

		const previousTotal = props.matrix.colTotals[last - 1];

		return {
			caption: [
				MONTH_NAMES[monthIndex(props.matrix.months[last])],
				'против',
				MONTH_GENITIVE[monthIndex(props.matrix.months[last - 1])]
			].join(' '),
			percent: previousTotal > 0
				? Math.round(((props.matrix.colTotals[last] - previousTotal) / previousTotal) * 100)
				: null
		};
	});
	const currentIndex = createMemo(() => props.matrix.months.indexOf(props.currentMonth));

	return (
		<div class={css.root}>
			<div class={css.tile}>
				<span class={css.label}>За период</span>
				<span class={css.value}>{props.formatAmount(props.matrix.totalMinor)}</span>
				<span class={css.hint}>{props.matrix.months.length} мес</span>
			</div>
			<div class={css.tile}>
				<span class={css.label}>В среднем</span>
				<span class={css.value}>{props.matrix.avgMinor === null ? '—' : props.formatAmount(props.matrix.avgMinor)}</span>
				<span class={css.hint}>за закрытый месяц</span>
			</div>
			<div class={css.tile}>
				<span class={css.label}>Последний закрытый</span>
				<Show when={delta()} fallback={<span class={css.hint}>нужно минимум два закрытых месяца</span>}>
					{(value) => {
						const percent = () => value().percent;

						return (
							<Show
								when={percent() !== null}
								fallback={<><span class={css.value}>—</span><span class={css.hint}>в прошлом месяце трат нет</span></>}
							>
								<span class={cn(css.value, (percent() ?? 0) > 0 && css.up, (percent() ?? 0) < 0 && css.down)}>
									{(percent() ?? 0) > 0 ? '+' : ''}{percent()}%
								</span>
								<span class={css.hint}>{value().caption}</span>
							</Show>
						);
					}}
				</Show>
			</div>
			<div class={css.tile}>
				<span class={css.label}>Текущий месяц</span>
				<span class={css.value}>{currentIndex() === -1 ? '—' : props.formatAmount(props.matrix.colTotals[currentIndex()])}</span>
				<span class={css.hint}>{currentIndex() === -1 ? 'не входит в период' : 'месяц ещё идёт'}</span>
			</div>
		</div>
	);
}
