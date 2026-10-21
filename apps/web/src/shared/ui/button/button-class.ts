import css from './button.module.scss';

import { cn } from '@/shared/lib';

/**
 * Visual hierarchy variants supported by the button.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Control heights shared with inputs and other interactive elements.
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonClassOptions = {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	fullWidth?: boolean;
	iconOnly?: boolean;
	class?: string;
};

const variantClassByVariant: Record<ButtonVariant, string> = {
	primary: css.variantPrimary,
	secondary: css.variantSecondary,
	ghost: css.variantGhost,
	danger: css.variantDanger
};

const sizeClassBySize: Record<ButtonSize, string> = {
	sm: css.sizeSm,
	md: css.sizeMd,
	lg: css.sizeLg
};

/**
 * Classes of the kit button, shared by `Button` and `ButtonLink`, so a link that looks like a button is the same button.
 */
export function buttonClass(options: ButtonClassOptions): string {
	return cn(
		css.button,
		variantClassByVariant[options.variant ?? 'primary'],
		sizeClassBySize[options.size ?? 'md'],
		options.fullWidth && css.fullWidth,
		options.iconOnly && css.iconOnly,
		options.loading && css.loading,
		options.class
	);
}

export const buttonPartClass = {
	content: css.content,
	icon: css.icon,
	label: css.label,
	spinner: css.spinner
};
