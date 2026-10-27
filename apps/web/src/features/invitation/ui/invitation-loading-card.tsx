import css from './invitation-card.module.scss';

import { Banner, Button, Skeleton, Typography } from '@/shared/ui';

import { CircleAlert, RefreshCw } from 'lucide-solid';
import { Show } from 'solid-js';

import type { InvitationRequestProblem } from '../model/invitation-state';

export type InvitationLoadingCardProps = {
	/** The preview failed in a way that can be repeated; without it the card says the invitation is being checked. */
	problem?: { kind: InvitationRequestProblem; message: string };
	onRetry: () => void;
	onCancel: () => void;
};

/**
 * The shared check and failure cards of Flow-Invite and Flow-AppInvite (no connection, too many requests). The kind is
 * not known until the preview succeeds, so the title is neutral.
 */
export function InvitationLoadingCard(props: InvitationLoadingCardProps) {
	return (
		<div aria-busy={props.problem === undefined} class={css.root}>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>Приглашение</Typography>
			</div>
			<Show
				fallback={(
					<>
						<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{props.problem?.message}</Banner>
						<Button fullWidth onClick={() => props.onRetry()} size='lg' startIcon={<RefreshCw/>}>Повторить</Button>
						<Button fullWidth onClick={() => props.onCancel()} size='lg' variant='ghost'>Отмена</Button>
					</>
				)}
				when={props.problem === undefined}
			>
				<div role='status'><Typography tone='secondary' variant='body-md'>Проверяем приглашение…</Typography></div>
				<Skeleton/>
				<Skeleton/>
				<Skeleton/>
			</Show>
		</div>
	);
}
