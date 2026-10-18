import css from './fab.module.scss';

import { cn, useTextInputFocus } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';

/**
 * Floating action button properties extending the native SolidJS button contract.
 */
export type FabProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> & {
	/** Required: the button has no visible text. */
	'aria-label': string;
	class?: string;
};

/**
 * Round 56 px primary action pinned above the phone bottom navigation
 * (mockup Kit-States, "FAB и нижняя навигация"). Visible only below the `sm`
 * breakpoint, where the toolbar "+" is hidden. Pass the icon as children.
 */
export function Fab(props: FabProps) {
	const [local, buttonProps] = splitProps(props, ['class', 'type']);
	const isKeyboardOpen = useTextInputFocus();

	return (
		<button
			{...buttonProps}
			class={cn(css.fab, isKeyboardOpen() && css.fabHidden, local.class)}
			type={local.type ?? 'button'}
		/>
	);
}
