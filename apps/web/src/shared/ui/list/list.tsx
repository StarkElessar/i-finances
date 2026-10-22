import css from './list.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type ListProps = {
	/** `ListRow` items. */
	children: JSX.Element;
	/** Names the list for screen readers («Участники окружения»). */
	'aria-label'?: string;
	class?: string;
};

/**
 * Bordered list of rows (mockup `.i-list`): participants, invitations, reasons. The container clips the rounded
 * corners, the last row has no divider.
 */
export function List(props: ListProps) {
	return (
		<ul aria-label={props['aria-label']} class={cn(css.root, props.class)}>
			{props.children}
		</ul>
	);
}
