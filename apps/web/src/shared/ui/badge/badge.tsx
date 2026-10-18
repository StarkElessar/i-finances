import css from './badge.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';

/**
 * Meaning of the badge: `neutral` is a plain status, the others follow the semantic colours.
 */
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

/**
 * Badge properties extending the native SolidJS span contract.
 */
export type BadgeProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'class'> & {
	tone?: BadgeTone;
	/** Decorative icon before the label. The text must carry the meaning, not the colour or icon alone. */
	icon?: JSX.Element;
	class?: string;
};

const toneClassByTone: Record<BadgeTone, string> = {
	neutral: css.toneNeutral,
	success: css.toneSuccess,
	danger: css.toneDanger,
	warning: css.toneWarning,
	info: css.toneInfo
};

/**
 * Static status label (mockup Kit-Controls, «Badge»): receipt and operation states, a budget
 * percentage. Not interactive.
 */
export function Badge(props: BadgeProps) {
	const [local, spanProps] = splitProps(props, ['children', 'class', 'icon', 'tone']);

	return (
		<span {...spanProps} class={cn(css.badge, toneClassByTone[local.tone ?? 'neutral'], local.class)}>
			<Show when={local.icon}>
				<span aria-hidden='true' class={css.icon}>{local.icon}</span>
			</Show>
			{local.children}
		</span>
	);
}
