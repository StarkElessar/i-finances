import css from './security-section.module.scss';

import { Badge } from '@/shared/ui';

import type { JSX } from 'solid-js';
import { createUniqueId, Show } from 'solid-js';

export type SecuritySectionProps = {
	children: JSX.Element;
	/** A number next to the title (keys, sessions). */
	count?: number;
	title: string;
};

/** One block of the «Безопасность» dialog: a heading, an optional count and the content (mockup `M-Security`, `D-Security`). */
export function SecuritySection(props: SecuritySectionProps) {
	const titleId = createUniqueId();

	return (
		<section aria-labelledby={titleId} class={css.root}>
			<div class={css.heading}>
				<h3 class={css.title} id={titleId}>{props.title}</h3>
				<Show when={props.count !== undefined}>
					<Badge>{props.count}</Badge>
				</Show>
			</div>
			{props.children}
		</section>
	);
}
