import css from './story-stack.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type StoryStackProps = {
	children: JSX.Element;
	/** Lay children out in a column instead of a wrapping row. */
	column?: boolean;
	class?: string;
};

/**
 * Layout helper for stories that show several variants side by side. Spacing comes from tokens,
 * so stories do not need inline `style` literals.
 */
export function StoryStack(props: StoryStackProps) {
	return <div class={cn(css.root, props.column ? css.column : css.row, props.class)}>{props.children}</div>;
}
