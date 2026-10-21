import css from './list.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type ListProps = {
	/** `ListRow`s. */
	children: JSX.Element;
	/** Names the list for screen readers («Ключи доступа»). */
	'aria-label'?: string;
	class?: string;
};

/**
 * A bordered card of rows, one under another (mockup `.i-list`): passkeys, sessions, linked accounts. Rows are
 * separated by a line; the last one has none.
 */
export function List(props: ListProps) {
	return <ul aria-label={props['aria-label']} class={cn(css.root, props.class)}>{props.children}</ul>;
}
