import css from './invitation-card.module.scss';

import { Button, IconTile, List, ListRow, Typography } from '@/shared/ui';

import { Check, Clock, Search, X } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { describeUnavailable, type InvitationUnavailableIcon } from '../model/describe-unavailable';
import type { InvitationUnavailableCause } from '../model/invitation-state';

export type InvitationUnavailableCardProps = {
	cause: InvitationUnavailableCause;
	onDismiss: () => void;
};

const ICONS: Record<InvitationUnavailableIcon, () => JSX.Element> = {
	check: () => <Check/>,
	clock: () => <Clock/>,
	search: () => <Search/>,
	x: () => <X/>
};

/**
 * Card 2 of `Flow-Invite`: «Эта ссылка не работает» with the one reason that applies (expired, used, revoked, unknown;
 * decision of 2026-10-19 in Р5), a link cut by a messenger, or a dead link with no reason.
 */
export function InvitationUnavailableCard(props: InvitationUnavailableCardProps) {
	const view = () => describeUnavailable(props.cause);

	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>Эта ссылка не работает</Typography>
			</div>
			<List aria-label='Причина'>
				<ListRow
					leading={<IconTile tone='neutral'>{ICONS[view().icon]()}</IconTile>}
					meta={view().description}
					title={view().title}
				/>
			</List>
			<Button fullWidth onClick={() => props.onDismiss()} size='lg' variant='secondary'>Понятно</Button>
		</div>
	);
}
