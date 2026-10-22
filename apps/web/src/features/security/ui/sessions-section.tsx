import css from './sessions-section.module.scss';

import { Badge, Banner, Button, ConfirmPanel, List, ListRow, Skeleton } from '@/shared/ui';

import { CircleAlert, CircleCheck, LogOut, Monitor, Smartphone } from 'lucide-solid';
import { createEffect, createSignal, For, Match, on, Show, Switch } from 'solid-js';

import type { SecurityClient } from '../api';
import { createLoadedList } from '../model/create-loaded-list';
import { describeSession, sortSessions } from '../model/describe-session';
import { describeRevokeOtherSessionsResult, describeRevokeSessionResult } from '../model/security-action-outcome';

import { SecuritySection } from './security-section';

export type SessionsSectionProps = {
	client: Pick<SecurityClient, 'listSessions' | 'revokeOtherSessions' | 'revokeSession'>;
	/** Bumped by the password block after a change: the sessions of other devices were ended, so the list is read again. */
	reloadKey?: number;
};

const LIST_FAILED = 'Не удалось загрузить сеансы.';

const REVOKE_FAILED = 'Не удалось завершить сеанс. Попробуйте ещё раз.';

/**
 * Where the account is signed in: the browser and system, the last activity as a date and the rough address, «Этот сеанс»
 * without a button, «Завершить» for the others and «Завершить все остальные» with a confirmation inside the dialog
 * (mockup `M-Security`, `D-Security`). The current session is never offered for ending: signing out is «Выйти» in the menu.
 */
export function SessionsSection(props: SessionsSectionProps) {
	const sessions = createLoadedList(async () => {
		const result = await props.client.listSessions();

		if (!result.ok) {
			throw new Error(result.message);
		}

		return sortSessions(result.sessions);
	}, LIST_FAILED);
	const [revokingId, setRevokingId] = createSignal<string>();
	const [isConfirmingAll, setIsConfirmingAll] = createSignal(false);
	const [isRevokingAll, setIsRevokingAll] = createSignal(false);
	const [notice, setNotice] = createSignal<{ message: string; tone: 'danger' | 'success' }>();
	const rows = () => {
		const state = sessions.state();
		const now = new Date();

		return state.kind === 'ready' ? state.items.map((session) => describeSession(session, now)) : [];
	};
	const otherCount = () => rows().filter((row) => !row.isCurrent).length;
	const readyCount = () => {
		const state = sessions.state();

		return state.kind === 'ready' ? state.items.length : undefined;
	};

	const handleRevoke = async (id: string): Promise<void> => {
		if (revokingId() !== undefined || isRevokingAll()) {
			return;
		}

		setNotice(undefined);
		setRevokingId(id);

		try {
			const outcome = describeRevokeSessionResult(await props.client.revokeSession(id));

			if (outcome.kind === 'failed') {
				setNotice({ message: outcome.message, tone: 'danger' });
			}
			else {
				// Ended, already gone, or the current one (a stale list): either way the list is read again, no failure shown.
				await sessions.reload();
			}
		}
		catch {
			setNotice({ message: REVOKE_FAILED, tone: 'danger' });
		}
		finally {
			setRevokingId(undefined);
		}
	};

	const handleRevokeOthers = async (): Promise<void> => {
		if (isRevokingAll()) {
			return;
		}

		setNotice(undefined);
		setIsRevokingAll(true);

		try {
			const outcome = describeRevokeOtherSessionsResult(await props.client.revokeOtherSessions());

			setIsConfirmingAll(false);

			if (outcome.kind === 'revoked') {
				setNotice({ message: `Завершено других сеансов: ${outcome.revokedSessionCount}.`, tone: 'success' });
				await sessions.reload();
			}
			else {
				setNotice({ message: outcome.message, tone: 'danger' });
			}
		}
		catch {
			setIsConfirmingAll(false);
			setNotice({ message: REVOKE_FAILED, tone: 'danger' });
		}
		finally {
			setIsRevokingAll(false);
		}
	};

	createEffect(on(() => props.reloadKey, (_key, previousKey) => {
		if (previousKey !== undefined) {
			void sessions.reload();
		}
	}));

	return (
		<SecuritySection count={readyCount()} title='Активные сеансы'>
			<Switch>
				<Match when={sessions.state().kind === 'error'}>
					<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{LIST_FAILED}</Banner>
					<Button class={css.action} variant='secondary' onClick={() => void sessions.reload()}>Повторить</Button>
				</Match>
				<Match when={sessions.state().kind === 'loading'}>
					<div aria-busy='true' aria-label='Загружаем сеансы' class={css.skeleton} role='status'>
						<For each={[1, 2]}>
							{() => (
								<div class={css.skeletonRow}>
									<Skeleton tile/>
									<div class={css.skeletonText}>
										<Skeleton inlineSize='35%'/>
										<Skeleton inlineSize='60%'/>
									</div>
								</div>
							)}
						</For>
					</div>
				</Match>
				<Match when>
					<List aria-label='Активные сеансы'>
						<For each={rows()}>
							{(row) => (
								<ListRow
									icon={row.deviceKind === 'phone' ? <Smartphone/> : <Monitor/>}
									meta={row.meta}
									tint={row.deviceKind === 'phone' ? 1 : 10}
									title={(
										<>
											{row.title}
											<Show when={row.isCurrent}>
												{' '}
												<Badge class={css.currentBadge} tone='info'>Этот сеанс</Badge>
											</Show>
										</>
									)}
									trailing={row.isCurrent
										? undefined
										: (
											<Button
												aria-label={`Завершить сеанс: ${row.title}`}
												disabled={isRevokingAll() || (revokingId() !== undefined && revokingId() !== row.id)}
												loading={revokingId() === row.id}
												size='sm'
												variant='secondary'
												onClick={() => void handleRevoke(row.id)}
											>
												Завершить
											</Button>
										)}
								/>
							)}
						</For>
					</List>
				</Match>
			</Switch>
			<Show when={sessions.state().kind === 'ready' && otherCount() === 0}>
				<p class={css.empty}>Других сеансов нет.</p>
			</Show>
			<Show when={notice()}>
				{(current) => (
					<Banner
						icon={current().tone === 'success' ? <CircleCheck/> : <CircleAlert/>}
						role={current().tone === 'danger' ? 'alert' : 'status'}
						tone={current().tone}
					>
						{current().message}
					</Banner>
				)}
			</Show>
			<Show when={isConfirmingAll()}>
				<ConfirmPanel
					confirmLabel='Завершить'
					description='Другие устройства выйдут из аккаунта. Этот сеанс останется.'
					loading={isRevokingAll()}
					title='Завершить все остальные сеансы?'
					onCancel={() => setIsConfirmingAll(false)}
					onConfirm={() => void handleRevokeOthers()}
				/>
			</Show>
			<Show when={sessions.state().kind === 'ready' && otherCount() > 0 && !isConfirmingAll()}>
				<Button
					class={css.action}
					disabled={revokingId() !== undefined}
					startIcon={<LogOut/>}
					variant='secondary'
					onClick={() => {
						setNotice(undefined);
						setIsConfirmingAll(true);
					}}
				>
					Завершить все остальные
				</Button>
			</Show>
		</SecuritySection>
	);
}
