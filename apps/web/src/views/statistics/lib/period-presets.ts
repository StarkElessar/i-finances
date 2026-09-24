import { addMonths } from './month-keys';

export type PeriodPreset = '3' | '6' | '12' | 'ytd';

export type MonthRange = {
	from: string;
	to: string;
};

export const PERIOD_PRESETS: readonly { id: PeriodPreset; label: string }[] = [
	{ id: '3', label: '3 мес' },
	{ id: '6', label: '6 мес' },
	{ id: '12', label: '12 мес' },
	{ id: 'ytd', label: 'С начала года' }
];

export function resolvePeriodPreset(preset: PeriodPreset, currentMonth: string, earliestMonth: string): MonthRange {
	const from = preset === 'ytd'
		? `${currentMonth.slice(0, 4)}-01`
		: addMonths(currentMonth, -(Number(preset) - 1));

	return { from: from < earliestMonth ? earliestMonth : from, to: currentMonth };
}

export function isPresetActive(preset: PeriodPreset, range: MonthRange, currentMonth: string, earliestMonth: string): boolean {
	const resolved = resolvePeriodPreset(preset, currentMonth, earliestMonth);

	return resolved.from === range.from && resolved.to === range.to;
}
