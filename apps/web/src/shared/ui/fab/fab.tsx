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
	/** `secondary` is the 48 px shortcut stacked above the primary button (mockup M-ReceiptCapture). */
	variant?: 'primary' | 'secondary';
};

/**
 * Round 56 px primary action pinned above the phone bottom navigation
 * (mockup Kit-States, "FAB и нижняя навигация"). Visible only below the `sm`
 * breakpoint, where the toolbar "+" is hidden. Pass the icon as children. The `secondary` variant is a 48 px white
 * button that sits right above the primary one.
 */
export function Fab(props: FabProps) {
	const [local, buttonProps] = splitProps(props, ['class', 'type', 'variant']);
	const isKeyboardOpen = useTextInputFocus();

	return (
		<button
			{...buttonProps}
			class={cn(css.fab, local.variant === 'secondary' && css.secondary, isKeyboardOpen() && css.fabHidden, local.class)}
			type={local.type ?? 'button'}
		/>
	);
}
