import css from './app-invitation-dialog.module.scss';

import { formatMinutesAccusative } from '@/shared/lib/format-minutes';
import { Banner, Button, Dialog, Skeleton, Typography } from '@/shared/ui';

import { MAX_ACTIVE_APP_INVITATIONS } from '@i-finances/contracts';
import { CircleAlert, Plus, RefreshCw } from 'lucide-solid';
import { createUniqueId, Match, Show, Switch } from 'solid-js';

import type { AppInvitationPanelState } from '../model/app-invitation-panel-state';
import { selectAppInvitations } from '../model/select-app-invitations';

import { AppInvitationForm } from './app-invitation-form';
import { AppInvitationLists, type AppInvitationListsProps } from './app-invitation-lists';
import { CreatedAppInvitation } from './created-app-invitation';

export type AppInvitationDialogViewProps = AppInvitationListsProps & {
	state: AppInvitationPanelState;
	now: number;
	canShare?: boolean;
	onClose: () => void;
	onRetry: () => void;
	onStartCreate: () => void;
	onNoteInput: (note: string) => void;
	onCreate: () => void;
	onBack: () => void;
};

/** The same kit dialog chrome is used by the live feature and every state in Storybook. */
export function AppInvitationDialogView(props: AppInvitationDialogViewProps) {
	const formId = createUniqueId();
	const isFull = () => props.state.limitReached === true
		|| selectAppInvitations(props.state.invitations, false).active.length >= MAX_ACTIVE_APP_INVITATIONS;
	const retrySeconds = () => Math.max(0, Math.ceil(((props.state.createRetryAt ?? 0) - props.now) / 1000));
	const error = () => props.state.error ?? props.state.createRateLimitError;
	const createDisabled = () => isFull() || retrySeconds() > 0 || props.state.createRateLimitError !== undefined
		|| props.state.busy !== undefined;

	return (
		<>
			<Dialog.Header closeLabel='Закрыть приглашения в приложение'>
				<Dialog.Title>Приглашения в приложение</Dialog.Title>
			</Dialog.Header>
			<Dialog.Body>
				<div class={css.stack}>
					<Switch>
						<Match when={props.state.load === 'loading'}>
							<section aria-busy='true' aria-label='Загружаем приглашения' class={css.section} role='status'>
								<Typography tone='secondary'>Загружаем приглашения…</Typography>
								<Skeleton/><Skeleton/><Skeleton/>
							</section>
						</Match>
						<Match when={props.state.load === 'failed' || props.state.load === 'forbidden'}>
							<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{props.state.error}</Banner>
							<Show when={props.state.load === 'failed'}>
								<Button onClick={props.onRetry} startIcon={<RefreshCw/>} variant='secondary'>Повторить</Button>
							</Show>
						</Match>
						<Match when={props.state.view === 'created' && props.state.created}>
							<Show when={props.state.created}>
								{(invitation) => <CreatedAppInvitation canShare={props.canShare} invitation={invitation()}/>}
							</Show>
						</Match>
						<Match when={props.state.load === 'ready'}>
							<Show when={error()}>
								{(message) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{message()}</Banner>}
							</Show>
							<Show when={retrySeconds() > 0}>
								<Banner role='status' tone='warning'>
									Повторите через {formatMinutesAccusative(Math.ceil(retrySeconds() / 60))}.
								</Banner>
							</Show>
							<Show when={isFull()}>
								<Banner icon={<CircleAlert/>} tone='info'>
									Уже есть {MAX_ACTIVE_APP_INVITATIONS} активных приглашений. Отзовите одно, чтобы создать новое.
								</Banner>
							</Show>
							<Show
								fallback={(
									<>
										<Typography tone='secondary'>
											Пригласите человека в i-finances. Он сможет создать своё окружение и пригласить близких.
										</Typography>
										<div>
											<Button
												disabled={createDisabled() || props.state.confirmingId !== undefined}
												onClick={props.onStartCreate}
												startIcon={<Plus/>}
											>
												Создать приглашение
											</Button>
										</div>
										<AppInvitationLists
											onAskRevoke={props.onAskRevoke}
											onCancelRevoke={props.onCancelRevoke}
											onConfirmRevoke={props.onConfirmRevoke}
											onToggleAccepted={props.onToggleAccepted}
											state={props.state}
										/>
									</>
								)}
								when={props.state.view === 'create'}
							>
								<AppInvitationForm
									error={props.state.noteError}
									id={formId}
									loading={props.state.busy === 'create'}
									note={props.state.note}
									onCreate={props.onCreate}
									onNoteInput={props.onNoteInput}
								/>
							</Show>
						</Match>
					</Switch>
				</div>
			</Dialog.Body>
			<Dialog.Footer>
				<Show
					fallback={(
						<Button onClick={props.state.view === 'created' && props.state.load === 'ready' ? props.onBack : props.onClose}>
							Готово
						</Button>
					)}
					when={props.state.view === 'create' && props.state.load === 'ready'}
				>
					<Button disabled={props.state.busy === 'create'} onClick={props.onBack} variant='secondary'>Отмена</Button>
					<Button
						disabled={createDisabled() || Boolean(props.state.noteError)}
						form={formId}
						loading={props.state.busy === 'create'}
						type='submit'
					>
						Создать приглашение
					</Button>
				</Show>
			</Dialog.Footer>
		</>
	);
}
