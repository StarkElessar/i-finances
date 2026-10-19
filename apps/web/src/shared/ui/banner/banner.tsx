import css from './banner.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

/** Mockup `.i-banner`: neutral (no modifier), `info`, `ok`, `warn`, `err`. */
export type BannerTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export type BannerProps = {
	tone?: BannerTone;
	/** A lucide icon; it takes the banner colour. */
	icon?: JSX.Element;
	/** The bold first words («Ссылка устарела.»), followed by the text on the same line. */
	title?: string;
	children?: JSX.Element;
	/**
	 * `status` or `alert` when the banner appears in answer to something and must be announced; nothing for a banner
	 * that is part of the page from the start.
	 */
	role?: 'alert' | 'status';
	class?: string;
};

const toneClassByTone: Record<BannerTone, string> = {
	danger: css.toneDanger,
	info: css.toneInfo,
	neutral: css.toneNeutral,
	success: css.toneSuccess,
	warning: css.toneWarning
};

/**
 * Inline message inside a card, dialog, sheet or form (mockup `.i-banner`, boards `Auth-Telegram`, `Kit-States`).
 */
export function Banner(props: BannerProps) {
	return (
		<div class={cn(css.root, toneClassByTone[props.tone ?? 'neutral'], props.class)} role={props.role}>
			<Show when={props.icon}>
				<span aria-hidden='true' class={css.icon}>{props.icon}</span>
			</Show>
			<div class={css.text}>
				<Show when={props.title}>{(title) => <b class={css.title}>{title()}</b>}</Show>
				<Show when={props.title && props.children}>{' '}</Show>
				{props.children}
			</div>
		</div>
	);
}
