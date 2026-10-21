import css from './skeleton.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type SkeletonProps = {
	/** Any CSS length or percentage; the full width of the container when omitted. */
	inlineSize?: string;
	/** Any CSS length; a text line when omitted. */
	blockSize?: string;
	/** A square tile (the icon of a row) instead of a text line: rounded like the row tile. */
	tile?: boolean;
	class?: string;
};

/**
 * A grey bar with a slow shimmer that stands in for text or an icon while a list loads (mockup `.i-skel`, board
 * `Kit-States`). It is decoration: put `aria-busy` on the section that loads and a text for screen readers next to it.
 * The shimmer stops for people who ask for less motion.
 */
export function Skeleton(props: SkeletonProps) {
	// Only the sizes that were given: an unset one must fall back to the CSS default, not to the word «undefined».
	const style = (): JSX.CSSProperties => ({
		...(props.blockSize === undefined ? {} : { '--skeleton-block-size': props.blockSize }),
		...(props.inlineSize === undefined ? {} : { '--skeleton-inline-size': props.inlineSize })
	});

	return <div aria-hidden='true' class={cn(css.root, props.tile && css.tile, props.class)} style={style()}/>;
}
