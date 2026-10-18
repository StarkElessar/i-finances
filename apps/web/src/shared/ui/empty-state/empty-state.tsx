import css from './empty-state.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

export type EmptyStateHeadingLevel = 2 | 3 | 4;

export type EmptyStateProps = {
	/** Icon inside the soft primary tile (any lucide icon). */
	icon: JSX.Element;
	title: string;
	/** One or two sentences: why it is empty and what to do. */
	description?: string;
	/** Optional call to action, usually a small `Button`. */
	action?: JSX.Element;
	/** Level of the title heading in the page outline. */
	headingLevel?: EmptyStateHeadingLevel;
	class?: string;
};

/**
 * Placeholder for a list, chart or section with nothing to show (mockup Kit-Surfaces, «Empty
 * state»): an icon tile, a title, a short explanation and optionally one action.
 */
export function EmptyState(props: EmptyStateProps) {
	return (
		<div class={cn(css.root, props.class)}>
			<span aria-hidden='true' class={css.art}>{props.icon}</span>
			<Dynamic class={css.title} component={`h${props.headingLevel ?? 3}`}>{props.title}</Dynamic>
			<Show when={props.description}>
				<p class={css.description}>{props.description}</p>
			</Show>
			<Show when={props.action}>{props.action}</Show>
		</div>
	);
}
