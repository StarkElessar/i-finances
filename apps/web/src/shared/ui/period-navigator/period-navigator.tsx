import css from './period-navigator.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';

import { ChevronLeft, ChevronRight } from 'lucide-solid';

export type PeriodNavigatorProps = {
	/** Current period, already formatted («Октябрь 2026»). */
	label: string;
	/** Accessible name of the back button («Предыдущий месяц»). */
	previousLabel: string;
	/** Accessible name of the forward button («Следующий месяц»). */
	nextLabel: string;
	/** `false` at the end of the allowed range (the current period): the forward button is disabled. */
	canMoveNext?: boolean;
	/**
	 * Button size: `md` (40 px, 44 on touch) in toolbars, `sm` (32, 44 on touch) only in a dense place such as
	 * a card header with no neighbours of another size.
	 */
	size?: 'sm' | 'md';
	onPrevious: () => void;
	onNext: () => void;
	class?: string;
};

/**
 * Steps through periods one at a time: back button, period name, forward button
 * (mockup Kit-Controls, «Навигатор периода»). The period name is a live region, so a screen reader
 * announces the new period after each step.
 */
export function PeriodNavigator(props: PeriodNavigatorProps) {
	return (
		<div class={cn(css.root, props.class)}>
			<Button aria-label={props.previousLabel} iconOnly size={props.size ?? 'md'} variant='ghost' onClick={() => props.onPrevious()}>
				<ChevronLeft size={18}/>
			</Button>
			<span aria-live='polite' class={css.label}>{props.label}</span>
			<Button
				aria-label={props.nextLabel}
				disabled={props.canMoveNext === false}
				iconOnly
				size={props.size ?? 'md'}
				variant='ghost'
				onClick={() => props.onNext()}
			>
				<ChevronRight size={18}/>
			</Button>
		</div>
	);
}
