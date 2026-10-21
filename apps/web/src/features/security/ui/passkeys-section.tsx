import css from './passkeys-section.module.scss';

import { Banner, Button, ConfirmPanel, List, ListRow, Skeleton } from '@/shared/ui';

import type { PasskeyRegistrationResult } from '@i-finances/contracts';
import { CircleAlert, CircleCheck, KeyRound, Monitor, Plus, Smartphone, Trash, TriangleAlert } from 'lucide-solid';
import { createSignal, For, Match, Show, Switch } from 'solid-js';

import type { SecurityClient } from '../api';
import { createLoadedList } from '../model/create-loaded-list';
import { describePasskey } from '../model/describe-passkey';
import { describePasskeyRegistrationError } from '../model/describe-passkey-registration-error';
import { describeDeletePasskeyResult } from '../model/security-action-outcome';

import { SecuritySection } from './security-section';

export type PasskeysSectionProps = {
	client: Pick<SecurityClient, 'deletePasskey' | 'listPasskeys'>;
	/** Whether this browser can create a passkey at all (`browserSupportsWebAuthn`). */
	isSupported: boolean;
	/** Creates a passkey on this device and saves it (`AuthClient.registerPasskey`). */
	register: () => Promise<PasskeyRegistrationResult>;
};

const LIST_FAILED = 'Не удалось загрузить ключи доступа.';

const DELETE_FAILED = 'Не удалось удалить ключ доступа. Попробуйте ещё раз.';

/**
 * Passkeys of the account: a list with the device, the dates and a delete action that asks inside the dialog, and
 * «Добавить ключ доступа» (mockup `M-Security`, `D-Security`: list, loading, empty, last-passkey hint, delete confirmation).
 * The last-passkey refusal is a hint to add another key first, not a failure.
 */
export function PasskeysSection(props: PasskeysSectionProps) {
	const passkeys = createLoadedList(async () => {
		const result = await props.client.listPasskeys();

		if (!result.ok) {
			throw new Error(result.message);
		}

		return result.passkeys;
	}, LIST_FAILED);
	const [pendingDeleteId, setPendingDeleteId] = createSignal<string>();
	const [isDeleting, setIsDeleting] = createSignal(false);
	const [isRegistering, setIsRegistering] = createSignal(false);
	const [isLastPasskeyHint, setIsLastPasskeyHint] = createSignal(false);
	const [notice, setNotice] = createSignal<{ message: string; tone: 'danger' | 'success' }>();
	const rows = () => {
		const state = passkeys.state();
		const now = new Date();

		return state.kind === 'ready' ? state.items.map((passkey) => describePasskey(passkey, now)) : [];
	};
	const pendingRow = () => rows().find((row) => row.id === pendingDeleteId());
	const readyCount = () => {
		const state = passkeys.state();

		return state.kind === 'ready' ? state.items.length : undefined;
	};

	const handleRegister = async (): Promise<void> => {
		if (isRegistering()) {
			return;
		}

		setNotice(undefined);
		setIsLastPasskeyHint(false);
		setIsRegistering(true);

		try {
			const result = await props.register();

			if (result.ok) {
				setNotice({ message: 'Ключ доступа добавлен.', tone: 'success' });
				await passkeys.reload();
			}
			else {
				setNotice({ message: result.message, tone: 'danger' });
			}
		}
		catch (error: unknown) {
			setNotice({ message: describePasskeyRegistrationError(error), tone: 'danger' });
		}
		finally {
			setIsRegistering(false);
		}
	};

	const handleConfirmDelete = async (): Promise<void> => {
		const id = pendingDeleteId();

		if (id === undefined || isDeleting()) {
			return;
		}

		setNotice(undefined);
		setIsDeleting(true);

		try {
			const outcome = describeDeletePasskeyResult(await props.client.deletePasskey(id));

			setPendingDeleteId(undefined);

			if (outcome.kind === 'last-passkey') {
				setIsLastPasskeyHint(true);
			}
			else if (outcome.kind === 'failed') {
				setNotice({ message: outcome.message, tone: 'danger' });
			}
			else {
				setIsLastPasskeyHint(false);
				await passkeys.reload();
			}
		}
		catch {
			setPendingDeleteId(undefined);
			setNotice({ message: DELETE_FAILED, tone: 'danger' });
		}
		finally {
			setIsDeleting(false);
		}
	};

	return (
		<SecuritySection count={readyCount()} title='Ключи доступа'>
			<Switch>
				<Match when={passkeys.state().kind === 'error'}>
					<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{LIST_FAILED}</Banner>
					<Button class={css.add} variant='secondary' onClick={() => void passkeys.reload()}>Повторить</Button>
				</Match>
				<Match when={passkeys.state().kind === 'loading'}>
					<div aria-busy='true' aria-label='Загружаем ключи доступа' class={css.skeleton} role='status'>
						<For each={[1, 2]}>
							{() => (
								<div class={css.skeletonRow}>
									<Skeleton tile/>
									<div class={css.skeletonText}>
										<Skeleton inlineSize='45%'/>
										<Skeleton inlineSize='75%'/>
									</div>
								</div>
							)}
						</For>
					</div>
				</Match>
				<Match when={rows().length === 0}>
					<Banner icon={<KeyRound/>}>Ключей доступа нет. Добавьте ключ, чтобы входить по отпечатку или Face ID.</Banner>
				</Match>
				<Match when>
					<List aria-label='Ключи доступа'>
						<For each={rows()}>
							{(row) => (
								<ListRow
									icon={row.deviceKind === 'phone' ? <Smartphone/> : <Monitor/>}
									meta={row.meta}
									tint={row.deviceKind === 'phone' ? 1 : 10}
									title={row.title}
									trailing={(
										<Button
											aria-label={`Удалить ключ доступа: ${row.title}`}
											disabled={isDeleting() || pendingDeleteId() === row.id}
											iconOnly
											size='sm'
											variant='danger-ghost'
											onClick={() => {
												setNotice(undefined);
												setIsLastPasskeyHint(false);
												setPendingDeleteId(row.id);
											}}
										>
											<Trash/>
										</Button>
									)}
								/>
							)}
						</For>
					</List>
				</Match>
			</Switch>
			<Show when={pendingRow()}>
				{(row) => (
					<ConfirmPanel
						confirmLabel='Удалить'
						description='Войти по нему с этого устройства станет нельзя. Другие способы входа остаются.'
						loading={isDeleting()}
						title={`Удалить ключ «${row().title}»?`}
						onCancel={() => setPendingDeleteId(undefined)}
						onConfirm={() => void handleConfirmDelete()}
					/>
				)}
			</Show>
			<Show when={isLastPasskeyHint()}>
				<Banner icon={<TriangleAlert/>} role='status' title='Это единственный ключ доступа.' tone='warning'>
					Сначала добавьте другой ключ, затем удалите этот.
				</Banner>
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
			<Show when={passkeys.state().kind !== 'error'}>
				<Show
					fallback={<Banner>Этот браузер не поддерживает ключи доступа.</Banner>}
					when={props.isSupported}
				>
					<Button
						class={css.add}
						loading={isRegistering()}
						startIcon={<Plus/>}
						variant='secondary'
						onClick={() => void handleRegister()}
					>
						Добавить ключ доступа
					</Button>
				</Show>
			</Show>
		</SecuritySection>
	);
}
