import css from './list.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type ListRowProps = {
	/** Avatar or icon tile in front of the text. */
	leading?: JSX.Element;
	title: JSX.Element;
	/** Second, quieter line: a login, a date, the time left. */
	meta?: JSX.Element;
	/** Badges and buttons at the end of the row. */
	trailing?: JSX.Element;
	/** 64 px rows of the participant and invitation lists; without it the row is as high as its content. */
	comfortable?: boolean;
	class?: string;
};

/**
 * One row of a `List` (mockup `.i-row`): leading visual, title with a quieter line under it, trailing actions.
 */
export function ListRow(props: ListRowProps) {
	return (
		<li class={cn(css.row, props.comfortable && css.rowComfortable, props.class)}>
			<Show when={props.leading}>{props.leading}</Show>
			<div class={css.text}>
				<div class={css.title}>{props.title}</div>
				<Show when={props.meta}>
					<div class={css.meta}>{props.meta}</div>
				</Show>
			</div>
			<Show when={props.trailing}>
				<div class={css.trailing}>{props.trailing}</div>
			</Show>
		</li>
	);
}
