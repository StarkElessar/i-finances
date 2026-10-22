import css from './page-card.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';

export type PageCardProps = {
	children: JSX.Element;
	class?: string;
};

/**
 * A whole page that is one card (boards `Flow-Onboarding`, `Flow-Invite`): on a phone the card fills the screen, from
 * 640 px it is 480 px wide in the middle with a shadow. For pages outside the finance shell: the onboarding of a user
 * without a household and the invitation.
 */
export function PageCard(props: PageCardProps) {
	return (
		<div class={css.page}>
			<main class={cn(css.card, props.class)}>
				{props.children}
			</main>
		</div>
	);
}
