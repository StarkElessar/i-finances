import css from './icon-tile.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

/** `primary` is the blue of the first chart colour (an active thing), `neutral` the grey of the last (a dead one). */
export type IconTileTone = 'neutral' | 'primary';

export type IconTileProps = {
	/** A lucide icon. */
	children: JSX.Element;
	tone?: IconTileTone;
	/** Account colour or category palette token; defaults to the tone's colour. */
	tint?: string;
	class?: string;
};

/**
 * Square tile with an icon on a tinted background (mockup `.i-tile` with `--tint`, boards `M-Household`,
 * `Flow-Invite`).
 */
export function IconTile(props: IconTileProps) {
	return (
		<span
			aria-hidden='true'
			class={cn(css.root, props.tone === 'neutral' ? css.toneNeutral : css.tonePrimary, props.class)}
			style={{ '--tile-tint': props.tint }}
		>
			{props.children}
		</span>
	);
}
