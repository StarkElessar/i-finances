import css from './chip.module.scss';

import { cn } from '@/shared/lib';

import { X } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';

/**
 * Chip properties extending the native SolidJS button contract.
 */
export type ChipProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'aria-pressed'> & {
	/** Toggle state. A chip with `selected` set is exposed as a toggle button (`aria-pressed`). */
	selected?: boolean;
	/** Colour of the leading dot, any CSS colour (the series colour of a category). */
	color?: string;
	/** Decorative icon before the label (mockup: «+ Категория»). */
	icon?: JSX.Element;
	/** Shows the × of a selected chip; the click still toggles the chip. */
	removable?: boolean;
	class?: string;
};

/**
 * Compact toggle for filters and quick choices (mockup Kit-Controls, «Chip»): a set of categories
 * in a comparison, a period preset. A selected chip is filled with the soft primary colour.
 */
export function Chip(props: ChipProps) {
	const [local, buttonProps] = splitProps(props, [
		'children',
		'class',
		'color',
		'icon',
		'removable',
		'selected',
		'type'
	]);

	return (
		<button
			{...buttonProps}
			aria-pressed={local.selected}
			class={cn(css.chip, local.selected && css.chipSelected, local.class)}
			type={local.type ?? 'button'}
		>
			<Show when={local.color}>
				{(color) => <span aria-hidden='true' class={css.dot} style={{ '--chip-dot': color() }}/>}
			</Show>
			<Show when={local.icon}>
				<span aria-hidden='true' class={css.icon}>{local.icon}</span>
			</Show>
			{local.children}
			<Show when={local.removable && local.selected}>
				<X aria-hidden='true' class={css.icon} size={14}/>
			</Show>
		</button>
	);
}
