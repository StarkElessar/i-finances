import css from './app-invitation-dialog.module.scss';

import { formatDeadline, getInitials } from '@/shared/lib';
import { Avatar, Badge, Button, ConfirmPanel, IconTile, List, ListRow, Typography } from '@/shared/ui';

import { MAX_ACTIVE_APP_INVITATIONS } from '@i-finances/contracts';
import { ChevronDown, ChevronUp, Link } from 'lucide-solid';
import { createUniqueId, For, Show } from 'solid-js';

import type { AppInvitationPanelState } from '../model/app-invitation-panel-state';
import { formatAppInvitationAcceptance } from '../model/format-app-invitation-acceptance';
import { selectAppInvitations } from '../model/select-app-invitations';

export type AppInvitationListsProps = {
	state: AppInvitationPanelState;
	onToggleAccepted: () => void;
	onAskRevoke: (id: string) => void;
	onCancelRevoke: () => void;
	onConfirmRevoke: () => void;
};

export function AppInvitationLists(props: AppInvitationListsProps) {
	const acceptedId = createUniqueId();
	const lists = () => selectAppInvitations(props.state.invitations, props.state.expanded);
	const disabled = () => props.state.busy !== undefined || props.state.confirmingId !== undefined;

	return (
		<>
			<section class={css.section}>
				<div class={css.sectionHeader}>
					<Typography as='h3' variant='body-lg' weight='semibold'>Активные приглашения</Typography>
					<Badge>{lists().active.length} из {MAX_ACTIVE_APP_INVITATIONS}</Badge>
				</div>
				<Show fallback={<Typography tone='secondary'>Активных приглашений пока нет.</Typography>} when={lists().active.length > 0}>
					<List aria-label='Активные приглашения'>
						<For each={lists().active}>
							{(invitation) => (
								<ListRow
									comfortable
									leading={<IconTile><Link/></IconTile>}
									meta={`Действует до ${formatDeadline(invitation.expiresAt) ?? '…'}`}
									title={invitation.note ?? 'Без заметки'}
									trailing={(
										<Button
											disabled={disabled()}
											onClick={() => props.onAskRevoke(invitation.id)}
											size='sm'
											variant='danger-ghost'
										>
											Отозвать
										</Button>
									)}
								/>
							)}
						</For>
					</List>
				</Show>
				<Show when={props.state.confirmingId}>
					<ConfirmPanel
						confirmLabel='Отозвать'
						description='Ссылка перестанет работать. Чтобы пригласить человека снова, создайте новую.'
						error={props.state.confirmError}
						loading={props.state.busy === 'revoke'}
						onCancel={props.onCancelRevoke}
						onConfirm={props.onConfirmRevoke}
						title='Отозвать приглашение?'
					/>
				</Show>
			</section>
			<Show when={lists().visibleAccepted.length > 0}>
				<section class={css.section} id={acceptedId}>
					<Typography as='h3' variant='body-lg' weight='semibold'>Недавно принятые</Typography>
					<List aria-label='Недавно принятые'>
						<For each={lists().visibleAccepted}>
							{(invitation) => (
								<ListRow
									comfortable
									leading={<Avatar initials={getInitials(invitation.acceptedBy?.displayName ?? '')}/>}
									meta={formatAppInvitationAcceptance(invitation)}
									title={invitation.acceptedBy?.displayName ?? 'Пользователь'}
								/>
							)}
						</For>
					</List>
					<Show when={lists().canExpand}>
						<div>
							<Button
								aria-controls={acceptedId}
								aria-expanded={props.state.expanded}
								disabled={props.state.busy !== undefined}
								endIcon={props.state.expanded ? <ChevronUp/> : <ChevronDown/>}
								onClick={props.onToggleAccepted}
								size='sm'
								variant='ghost'
							>
								{props.state.expanded ? 'Свернуть' : 'Смотреть далее'}
							</Button>
						</div>
					</Show>
				</section>
			</Show>
		</>
	);
}
