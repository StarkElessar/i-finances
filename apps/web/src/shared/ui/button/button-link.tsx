import type { JSX } from 'solid-js';
import { children, Show, splitProps } from 'solid-js';

import { buttonClass, buttonPartClass, type ButtonSize, type ButtonVariant } from './button-class';

export type ButtonLinkProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'class' | 'href'> & {
	children: JSX.Element;
	/** Required: a link without an address is not a link. While it is not ready, render a disabled `Button` instead. */
	href: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	fullWidth?: boolean;
	startIcon?: JSX.Element;
	endIcon?: JSX.Element;
	class?: string;
};

/**
 * A link that looks like the kit `Button`: same variants, sizes, hover and focus. For navigation that the browser must
 * perform on the press itself, for example the Telegram bot link of the sign-in (Safari and installed PWAs block a
 * window opened later from a script).
 *
 * It has no disabled or loading state on purpose: an anchor cannot be disabled, so show a `Button` until the address
 * is known.
 */
export function ButtonLink(props: ButtonLinkProps) {
	const [local, anchorProps] = splitProps(props, [
		'children',
		'variant',
		'size',
		'fullWidth',
		'startIcon',
		'endIcon',
		'class'
	]);

	const startIcon = children(() => local.startIcon);

	const endIcon = children(() => local.endIcon);

	return (
		<a {...anchorProps} class={buttonClass(local)}>
			<span class={buttonPartClass.content}>
				<Show keyed when={startIcon()}>
					{(icon) => <span aria-hidden='true' class={buttonPartClass.icon}>{icon}</span>}
				</Show>
				<span class={buttonPartClass.label}>{local.children}</span>
				<Show keyed when={endIcon()}>
					{(icon) => <span aria-hidden='true' class={buttonPartClass.icon}>{icon}</span>}
				</Show>
			</span>
		</a>
	);
}
