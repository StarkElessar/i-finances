import css from './choice-card.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type ChoiceCardGroupProps = {
	/** `ChoiceCard`s that share one `name`. */
	children: JSX.Element;
	/** Names the question the cards answer. */
	legend: string;
	class?: string;
};

/**
 * Fieldset around a set of `ChoiceCard`s. The legend is for screen readers only: the card text already says what is
 * asked.
 */
export function ChoiceCardGroup(props: ChoiceCardGroupProps) {
	return (
		<fieldset class={cn(css.group, props.class)}>
			<legend class={css.legend}>{props.legend}</legend>
			{props.children}
		</fieldset>
	);
}
