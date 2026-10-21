import type { JSX } from 'solid-js';
import { children, Show, splitProps } from 'solid-js';

import { buttonClass, buttonPartClass, type ButtonSize, type ButtonVariant } from './button-class';

export type { ButtonSize, ButtonVariant } from './button-class';

/**
 * Button properties extending the native SolidJS button contract.
 */
export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'class'> & {
	children: JSX.Element;
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	fullWidth?: boolean;
	iconOnly?: boolean;
	startIcon?: JSX.Element;
	endIcon?: JSX.Element;
	class?: string;
};

/**
 * Renders an accessible action control with consistent sizing and states.
 *
 * Icon-only usage must include an `aria-label`.
 */
export function Button(props: ButtonProps) {
	const [local, buttonProps] = splitProps(props, [
		'children',
		'variant',
		'size',
		'loading',
		'fullWidth',
		'iconOnly',
		'startIcon',
		'endIcon',
		'class',
		'type',
		'disabled'
	]);

	/**
	 * Resolves the optional leading icon without evaluating its JSX getter twice.
	 */
	const startIcon = children(() => local.startIcon);

	/**
	 * Resolves the optional trailing icon without evaluating its JSX getter twice.
	 */
	const endIcon = children(() => local.endIcon);

	return (
		<button
			{...buttonProps}
			aria-busy={local.loading || undefined}
			class={buttonClass(local)}
			disabled={Boolean(local.disabled || local.loading)}
			type={local.type ?? 'button'}
		>
			<span class={buttonPartClass.content}>
				<Show keyed when={startIcon()}>
					{(icon) => <span aria-hidden='true' class={buttonPartClass.icon}>{icon}</span>}
				</Show>
				<span class={buttonPartClass.label}>{local.children}</span>
				<Show keyed when={endIcon()}>
					{(icon) => <span aria-hidden='true' class={buttonPartClass.icon}>{icon}</span>}
				</Show>
			</span>
			<Show when={local.loading}>
				<span aria-hidden='true' class={buttonPartClass.spinner}/>
			</Show>
		</button>
	);
}
