import css from './typography.module.scss';

import { cn } from '~/shared/lib';

import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/**
 * Available semantic presets in the application type scale.
 */
export type TypographyVariant =
	| 'display'
	| 'heading-1'
	| 'heading-2'
	| 'heading-3'
	| 'body-lg'
	| 'body-md'
	| 'body-sm'
	| 'label'
	| 'caption';

/**
 * Supported text emphasis levels.
 */
export type TypographyTone = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'success' | 'inherit';

/**
 * Supported font weights independent from a typography preset.
 */
export type TypographyWeight = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * Text alignment options used by content and form layouts.
 */
export type TypographyAlign = 'start' | 'center' | 'end';

/**
 * Semantic HTML elements supported by the typography primitive.
 */
export type TypographyElement = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'label';

/**
 * Properties accepted by the typography primitive.
 */
export type TypographyProps = {
	children: JSX.Element;
	variant?: TypographyVariant;
	tone?: TypographyTone;
	weight?: TypographyWeight;
	align?: TypographyAlign;
	as?: TypographyElement;
	truncate?: boolean;
	class?: string;
	id?: string;
	title?: string;
};

const defaultElementByVariant: Record<TypographyVariant, TypographyElement> = {
	display: 'h1',
	'heading-1': 'h1',
	'heading-2': 'h2',
	'heading-3': 'h3',
	'body-lg': 'p',
	'body-md': 'p',
	'body-sm': 'p',
	label: 'span',
	caption: 'span'
};

const variantClassByVariant: Record<TypographyVariant, string> = {
	display: css.display,
	'heading-1': css.heading1,
	'heading-2': css.heading2,
	'heading-3': css.heading3,
	'body-lg': css.bodyLg,
	'body-md': css.bodyMd,
	'body-sm': css.bodySm,
	label: css.label,
	caption: css.caption
};

const toneClassByTone: Record<TypographyTone, string> = {
	primary: css.tonePrimary,
	secondary: css.toneSecondary,
	tertiary: css.toneTertiary,
	danger: css.toneDanger,
	success: css.toneSuccess,
	inherit: css.toneInherit
};

const weightClassByWeight: Record<TypographyWeight, string> = {
	regular: css.weightRegular,
	medium: css.weightMedium,
	semibold: css.weightSemibold,
	bold: css.weightBold
};

const alignClassByAlign: Record<TypographyAlign, string> = {
	start: css.alignStart,
	center: css.alignCenter,
	end: css.alignEnd
};

/**
 * Renders semantic text using the shared type scale and color tokens.
 */
export function Typography(props: TypographyProps) {
	/**
	 * Resolves the active preset while keeping prop reads reactive.
	 */
	const variant = () => props.variant ?? 'body-md';

	return (
		<Dynamic
			component={props.as ?? defaultElementByVariant[variant()]}
			class={cn(
				css.root,
				variantClassByVariant[variant()],
				toneClassByTone[props.tone ?? 'primary'],
				props.weight && weightClassByWeight[props.weight],
				props.align && alignClassByAlign[props.align],
				props.truncate && css.truncate,
				props.class
			)}
			id={props.id}
			title={props.title}
		>
			{props.children}
		</Dynamic>
	);
}
