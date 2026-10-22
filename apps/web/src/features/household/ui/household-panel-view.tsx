import css from './household-panel.module.scss';

import { Badge, Banner, Button, InlineConfirm, TextField, Typography } from '@/shared/ui';

import { CircleAlert, LoaderCircle, LogOut, Pencil, RefreshCw, Users } from 'lucide-solid';
import { createEffect, createSignal, Match, Show, Switch } from 'solid-js';

import { hasAnotherOwner } from '../model/household-panel';
import type { HouseholdPanelState } from '../model/household-panel-state';

import { HouseholdInvitations } from './household-invitations';
import { HouseholdMembers } from './household-members';

const REMOVE_CONSEQUENCE = 'Сеансы участника будут завершены, его операции останутся. '
	+ 'Войти снова можно, но без доступа к окружению.';

export type HouseholdPanelViewProps = {
	state: HouseholdPanelState;
	/** The id of the person looking (marks their row, hides their delete button, decides whether they may leave). */
	viewerId: string;
	/** Current time in ms, for the time left of the invitations. */
	now: number;
	onAskLeave: () => void;
	onAskRemove: (member: { displayName: string; userId: string }) => void;
	onCancelConfirmation: () => void;
	onConfirm: () => void;
	onCreateInvitation: () => void;
	onDismissCreatedInvitation: () => void;
	onRename: (name: string) => void;
	onRetryInvitations: () => void;
	onRetryLoad: () => void;
	onRevokeInvitation: (id: string) => void;
};

/**
 * The body of the household dialog (boards `M-Household`, `D-Household`): the name, the participants, an owner's
 * invitations and «Покинуть окружение». Presentational: `HouseholdPanel` owns the state and the requests.
 */
export function HouseholdPanelView(props: HouseholdPanelViewProps) {
	const [draft, setDraft] = createSignal('');
	const household = () => props.state.household;
	const isOwner = () => household()?.role === 'owner';
	const isDirty = () => draft().trim() !== (household()?.name ?? '') && draft().trim() !== '';
	const isBusy = () => props.state.busy !== undefined;
	const confirmation = () => props.state.confirmation;
	const removeTarget = () => {
		const current = confirmation();

		return current?.kind === 'remove' ? current.member : undefined;
	};
	const canLeave = () => {
		const current = household();

		return current !== undefined && (current.role === 'member' || hasAnotherOwner(current, props.viewerId));
	};

	createEffect(() => setDraft(household()?.name ?? ''));

	return (
		<Switch>
			<Match when={props.state.load === 'loading'}>
				<Banner icon={<LoaderCircle/>} role='status' tone='neutral'>Загружаем окружение…</Banner>
			</Match>
			<Match when={props.state.load === 'failed'}>
				<div class={css.stack}>
					<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{props.state.loadError}</Banner>
					<Button onClick={() => props.onRetryLoad()} startIcon={<RefreshCw/>} variant='secondary'>Повторить</Button>
				</div>
			</Match>
			<Match when={household()}>
				{(current) => (
					<div class={css.stack}>
						<form
							class={css.renameForm}
							onSubmit={(event) => {
								event.preventDefault();

								if (isOwner() && isDirty() && !isBusy()) {
									props.onRename(draft());
								}
							}}
						>
							<TextField
								disabled={!isOwner() || props.state.busy?.kind === 'rename'}
								endContent={isOwner() ? <Pencil/> : undefined}
								error={props.state.renameError}
								hint={props.state.renameError ? undefined : 'Видно всем участникам'}
								label='Название окружения'
								maxLength={120}
								onInput={(event) => setDraft(event.currentTarget.value)}
								value={draft()}
							/>
							<Show when={isOwner() && isDirty()}>
								<Button class={css.renameSave} loading={props.state.busy?.kind === 'rename'} type='submit'>
									Сохранить
								</Button>
							</Show>
						</form>

						<section class={css.section}>
							<div class={css.sectionHeader}>
								<Typography as='h3' variant='body-lg' weight='semibold'>Участники</Typography>
								<Badge>{current().members.length}</Badge>
							</div>
							<HouseholdMembers
								busyUserId={props.state.busy?.kind === 'remove' ? props.state.busy.userId : undefined}
								canRemove={isOwner()}
								isDisabled={isBusy() || confirmation() !== undefined}
								members={current().members}
								onRemove={(member) => props.onAskRemove(member)}
								viewerId={props.viewerId}
							/>
							<Show when={current().members.length === 1 && isOwner()}>
								<Banner icon={<Users/>} tone='neutral'>
									Пока только вы. Пригласите близких по ссылке, и общие счета заработают.
								</Banner>
							</Show>
							<Show when={removeTarget()}>
								{(member) => (
									<InlineConfirm
										confirmLabel='Удалить участника'
										description={REMOVE_CONSEQUENCE}
										error={props.state.confirmError}
										loading={props.state.busy?.kind === 'remove'}
										onCancel={() => props.onCancelConfirmation()}
										onConfirm={() => props.onConfirm()}
										title={`Удалить ${member().displayName} из окружения?`}
									/>
								)}
							</Show>
						</section>

						<Show when={isOwner()}>
							<HouseholdInvitations
								created={props.state.createdInvitation}
								error={props.state.inviteError ?? props.state.revokeError}
								invitations={props.state.invitations}
								isCreating={props.state.busy?.kind === 'create-invitation'}
								isDisabled={isBusy()}
								listError={props.state.invitationsError}
								now={props.now}
								onCreate={() => props.onCreateInvitation()}
								onDismissCreated={() => props.onDismissCreatedInvitation()}
								onRetryList={() => props.onRetryInvitations()}
								onRevoke={(id) => props.onRevokeInvitation(id)}
								revokingId={props.state.busy?.kind === 'revoke' ? props.state.busy.id : undefined}
							/>
						</Show>

						<Show when={canLeave()}>
							<section class={css.leave}>
								<Show
									fallback={(
										<Button
											class={css.leaveButton}
											disabled={isBusy() || confirmation() !== undefined}
											onClick={() => props.onAskLeave()}
											startIcon={<LogOut/>}
											variant='danger-ghost'
										>
											Покинуть окружение
										</Button>
									)}
									when={confirmation()?.kind === 'leave'}
								>
									<InlineConfirm
										confirmLabel='Покинуть'
										description='Вы потеряете доступ к его данным. Вернуться можно только по новому приглашению.'
										error={props.state.confirmError}
										loading={props.state.busy?.kind === 'leave'}
										onCancel={() => props.onCancelConfirmation()}
										onConfirm={() => props.onConfirm()}
										title={`Покинуть окружение «${current().name}»?`}
									/>
								</Show>
							</section>
						</Show>
					</div>
				)}
			</Match>
		</Switch>
	);
}
