import css from './flat-card.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type FlatCardProps = {
	/** Bold first line: a household name, a question. */
	title?: JSX.Element;
	/** Quieter text under the title. */
	children?: JSX.Element;
	class?: string;
};

/**
 * Card without a border on the subtle background (mockup `.i-card.flat`): the summary of a household in the refusal
 * and the consent of the invitation, the question of an inline confirmation.
 */
export function FlatCard(props: FlatCardProps) {
	return (
		<div class={cn(css.root, props.class)}>
			<Show when={props.title}><b class={css.title}>{props.title}</b></Show>
			<Show when={props.children}><div class={css.text}>{props.children}</div></Show>
		</div>
	);
}
