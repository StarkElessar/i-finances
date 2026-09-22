import css from './month-navigator.module.scss';

import { Button } from '@/shared/ui';

import {
	canMoveToNextOperationPeriod,
	formatLocalDateKey,
	shiftOperationPeriod
} from '@/entities/operation';

import { ChevronLeft, ChevronRight } from 'lucide-solid';

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
	const canMoveNext = () => canMoveToNextOperationPeriod(props.anchor, 'month', props.now);

	return (
		<div class={css.root}>
			<Button
				aria-label='Предыдущий месяц'
				iconOnly
				size='sm'
				variant='ghost'
				onClick={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', -1))}
			>
				<ChevronLeft size={18}/>
			</Button>
			<span class={css.label}>{formatMonthNavigatorLabel(props.anchor)}</span>
			<Button
				aria-label='Следующий месяц'
				disabled={!canMoveNext()}
				iconOnly
				size='sm'
				variant='ghost'
				onClick={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', 1))}
			>
				<ChevronRight size={18}/>
			</Button>
		</div>
	);
}

export function toMonthKey(anchor: Date): string {
	return formatLocalDateKey(anchor).slice(0, 7);
}
