import css from './period-range-picker.module.scss';

import { addMonths, listMonthKeys } from '@/views/statistics/lib/month-keys';
import { isPresetActive, type MonthRange, PERIOD_PRESETS, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';

import { MONTHLY_BREAKDOWN_MAX_MONTHS } from '@i-finances/contracts';
import { createMemo, For, type JSX } from 'solid-js';

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

function formatMonthOption(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1));

	return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
}

export type PeriodRangePickerProps = {
	currentMonth: string;
	earliestMonth: string;
	onChange: (range: MonthRange) => void;
	range: MonthRange;
};

export function PeriodRangePicker(props: PeriodRangePickerProps): JSX.Element {
	const allMonths = createMemo(() => listMonthKeys(props.earliestMonth, props.currentMonth));
	const fromOptions = createMemo(() => {
		const lowest = addMonths(props.range.to, -(MONTHLY_BREAKDOWN_MAX_MONTHS - 1));

		return allMonths().filter((month) => month <= props.range.to && month >= lowest);
	});
	const toOptions = createMemo(() => {
		const highest = addMonths(props.range.from, MONTHLY_BREAKDOWN_MAX_MONTHS - 1);

		return allMonths().filter((month) => month >= props.range.from && month <= highest);
	});

	return (
		<div class={css.root}>
			<span class={css.label}>Период</span>
			<For each={PERIOD_PRESETS}>
				{(preset) => (
					<button
						aria-pressed={isPresetActive(preset.id, props.range, props.currentMonth, props.earliestMonth)}
						class={css.preset}
						onClick={() => props.onChange(resolvePeriodPreset(preset.id, props.currentMonth, props.earliestMonth))}
						type='button'
					>
						{preset.label}
					</button>
				)}
			</For>
			<span class={css.range}>
				<select
					aria-label='С месяца'
					class={css.select}
					onChange={(event) => props.onChange({ from: event.currentTarget.value, to: props.range.to })}
					value={props.range.from}
				>
					<For each={fromOptions()}>
						{(month) => <option value={month}>{formatMonthOption(month)}</option>}
					</For>
				</select>
				<span aria-hidden='true'>—</span>
				<select
					aria-label='По месяц'
					class={css.select}
					onChange={(event) => props.onChange({ from: props.range.from, to: event.currentTarget.value })}
					value={props.range.to}
				>
					<For each={toOptions()}>
						{(month) => <option value={month}>{formatMonthOption(month)}</option>}
					</For>
				</select>
			</span>
		</div>
	);
}
