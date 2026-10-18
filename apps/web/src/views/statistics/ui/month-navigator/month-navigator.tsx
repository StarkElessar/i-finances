import css from './month-navigator.module.scss';

import { PeriodNavigator } from '@/shared/ui/period-navigator';

import {
	canMoveToNextOperationPeriod,
	formatLocalDateKey,
	shiftOperationPeriod
} from '@/entities/operation';

export type MonthNavigatorProps = {
	anchor: Date;
	now: Date;
	onChange: (anchor: Date) => void;
};

function formatMonthNavigatorLabel(anchor: Date): string {
	const value = new Intl.DateTimeFormat('ru-BY', { month: 'long', year: 'numeric' }).format(anchor);

	return value.charAt(0).toLocaleUpperCase('ru-BY') + value.slice(1);
}

export function MonthNavigator(props: MonthNavigatorProps) {
	return (
		<PeriodNavigator
			canMoveNext={canMoveToNextOperationPeriod(props.anchor, 'month', props.now)}
			class={css.root}
			label={formatMonthNavigatorLabel(props.anchor)}
			nextLabel='Следующий месяц'
			previousLabel='Предыдущий месяц'
			size='sm'
			onNext={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', 1))}
			onPrevious={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', -1))}
		/>
	);
}

export function toMonthKey(anchor: Date): string {
	return formatLocalDateKey(anchor).slice(0, 7);
}
