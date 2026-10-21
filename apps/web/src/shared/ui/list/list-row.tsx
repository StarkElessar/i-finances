import css from './list.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

/** One of the ten category-palette colours (`--color-series-N`) that tints the icon tile. */
export type ListRowTint = 1 | 10 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ListRowProps = {
	/** A lucide icon inside the tinted tile. */
	icon: JSX.Element;
	tint?: ListRowTint;
	/** The first line; it may carry a `Badge` after the text. */
	title: JSX.Element;
	/** The second line, small and quiet. */
	meta?: string;
	/** Something on the right: a status badge or an icon button. */
	trailing?: JSX.Element;
	class?: string;
};

/**
 * A row of a `List`: an icon tile, two lines of text and an optional action on the right (mockup `.i-row` with `.i-tile`,
 * 64 px high, `--row-height-comfortable`). The text wraps instead of being cut: a device name must stay readable.
 */
export function ListRow(props: ListRowProps) {
	const tintStyle = (): JSX.CSSProperties => ({ '--tint': `var(--color-series-${props.tint ?? 1})` });

	return (
		<li class={cn(css.row, props.class)}>
			<span aria-hidden='true' class={css.tile} style={tintStyle()}>{props.icon}</span>
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
