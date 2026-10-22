import css from './invitation-card.module.scss';

import { Banner, Button, Typography } from '@/shared/ui';

import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-solid';
import { Show } from 'solid-js';

import type { InvitationRequestProblem } from '../model/invitation-state';

export type InvitationLoadingCardProps = {
	/** The preview failed in a way that can be repeated; without it the card says the invitation is being checked. */
	problem?: { kind: InvitationRequestProblem; message: string };
	onRetry: () => void;
	onCancel: () => void;
};

/**
 * Not on the board: the moment while the invitation is checked, and the failure of that check (no connection, too many
 * requests). The check needs no sign-in, so a guest sees this card first too.
 */
export function InvitationLoadingCard(props: InvitationLoadingCardProps) {
	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>Приглашение в окружение</Typography>
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
				<Banner icon={<LoaderCircle/>} role='status' tone='neutral'>Проверяем приглашение…</Banner>
			</Show>
		</div>
	);
}
