import css from './password-section.module.scss';

import { formatMinutesAccusative } from '@/shared/lib';
import { Banner, Button, PasswordField } from '@/shared/ui';

import type { ChangePasswordInput } from '@i-finances/contracts';
import { CircleAlert, CircleCheck, Lock } from 'lucide-solid';
import { createSignal, onCleanup, Show } from 'solid-js';

import type { ChangePasswordResponse } from '../api';
import {
	type ChangePasswordOutcome,
	describeChangePasswordResult,
	formatRevokedSessions,
	type PasswordFieldErrors,
	validateChangePassword
} from '../model/change-password-outcome';

import { SecuritySection } from './security-section';

export type PasswordSectionProps = {
	/** `false` for an account created through Telegram: there is no password to change (setting one is a future screen, v2). */
	hasPassword: boolean;
	change: (input: ChangePasswordInput) => Promise<ChangePasswordResponse>;
	/** The password was changed: the sessions of other devices are gone, so the list of sessions is read again. */
	onChanged: () => void;
};

const SECONDS_PER_MINUTE = 60;

const MILLISECONDS_PER_SECOND = 1_000;

const CHANGE_FAILED = 'Не удалось сменить пароль. Попробуйте ещё раз.';

const NEW_PASSWORD_HINT = 'Не короче 12 символов. Другие сеансы будут завершены';

/** «через 4 минуты» for a wait the server named; without a number the text says «позже». */
function formatRetryAfter(seconds: number): string {
	return `через ${formatMinutesAccusative(Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE)))}`;
}

/**
 * Change of the password: the current one and a new one of at least 12 characters (mockup `M-Security`, `D-Security`).
 * A wrong current password stays at its field and never signs the person out; a 429 is shown and nothing is retried
 * by itself; the other sessions end on success and the browser already holds the new cookie. An account without a
 * password gets a plain explanation: «Задать пароль» is a future screen (v2) and is not built.
 */
export function PasswordSection(props: PasswordSectionProps) {
	const [currentPassword, setCurrentPassword] = createSignal('');
	const [newPassword, setNewPassword] = createSignal('');
	const [fieldErrors, setFieldErrors] = createSignal<PasswordFieldErrors>({});
	const [outcome, setOutcome] = createSignal<ChangePasswordOutcome>();
	const [isPending, setIsPending] = createSignal(false);
	const [isLocked, setIsLocked] = createSignal(false);
	const [retryAfterSeconds, setRetryAfterSeconds] = createSignal<number>();
	let unlockTimer: ReturnType<typeof setTimeout> | undefined;

	const clearLock = (): void => {
		if (unlockTimer !== undefined) {
			clearTimeout(unlockTimer);
			unlockTimer = undefined;
		}
	};

	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();

		if (isPending() || isLocked()) {
			return;
		}

		const validation = validateChangePassword(currentPassword(), newPassword());

		if (!validation.ok) {
			setFieldErrors(validation.fieldErrors);
			setOutcome(undefined);
			return;
		}

		setFieldErrors({});
		setOutcome(undefined);
		setRetryAfterSeconds(undefined);
		setIsPending(true);

		try {
			const response = await props.change(validation.input);
			const next = describeChangePasswordResult(response.result);

			setOutcome(next);

			if (next.kind === 'changed') {
				setCurrentPassword('');
				setNewPassword('');
				props.onChanged();
			}
			else if (next.kind === 'field-errors') {
				setFieldErrors(next.fieldErrors);
			}
			else if (next.kind === 'rate-limited' && response.retryAfterSeconds !== undefined) {
				// The server named a wait: the form rests that long. Without a number there is nothing honest to wait for.
				setRetryAfterSeconds(response.retryAfterSeconds);
				setIsLocked(true);
				clearLock();
				unlockTimer = setTimeout(() => {
					setIsLocked(false);
					setRetryAfterSeconds(undefined);
				}, response.retryAfterSeconds * MILLISECONDS_PER_SECOND);
			}
		}
		catch {
			setOutcome({ kind: 'failed', message: CHANGE_FAILED });
		}
		finally {
			setIsPending(false);
		}
	};

	const changedOutcome = () => {
		const current = outcome();

		return current?.kind === 'changed' ? current : undefined;
	};
	const rateLimitedOutcome = () => outcome()?.kind === 'rate-limited';
	// «Нет пароля» and an unexpected failure: the server's own text, no field to point at.
	const messageOutcome = () => {
		const current = outcome();

		return current?.kind === 'failed' || current?.kind === 'password-not-set' ? current : undefined;
	};
	const rateLimitText = () => {
		const seconds = retryAfterSeconds();

		return seconds === undefined ? 'Повторите позже.' : `Повторите ${formatRetryAfter(seconds)}.`;
	};

	onCleanup(clearLock);

	return (
		<SecuritySection title='Пароль'>
			<Show
				fallback={(
					<Banner icon={<Lock/>}>
						Пароль не задан. Войти по паролю нельзя, вход идёт через Telegram или ключ доступа.
					</Banner>
				)}
				when={props.hasPassword}
			>
				<form class={css.card} noValidate onSubmit={(event) => void handleSubmit(event)}>
					<Show when={changedOutcome()}>
						{(current) => (
							<Banner icon={<CircleCheck/>} role='status' tone='success'>
								Пароль изменён. <b>{formatRevokedSessions(current().revokedSessionCount)}</b>
							</Banner>
						)}
					</Show>
					<Show when={rateLimitedOutcome()}>
						<Banner icon={<CircleAlert/>} role='alert' title='Слишком много попыток.' tone='danger'>
							{rateLimitText()}
						</Banner>
					</Show>
					<Show when={messageOutcome()}>
						{(current) => (
							<Banner icon={<CircleAlert/>} role='alert' tone='danger'>{current().message}</Banner>
						)}
					</Show>
					<PasswordField
						autocomplete='current-password'
						disabled={isPending() || isLocked()}
						error={fieldErrors().currentPassword}
						label='Текущий пароль'
						name='currentPassword'
						value={currentPassword()}
						onInput={(event) => setCurrentPassword(event.currentTarget.value)}
					/>
					<PasswordField
						autocomplete='new-password'
						disabled={isPending() || isLocked()}
						error={fieldErrors().newPassword}
						hint={NEW_PASSWORD_HINT}
						label='Новый пароль'
						name='newPassword'
						placeholder='Не короче 12 символов'
						value={newPassword()}
						onInput={(event) => setNewPassword(event.currentTarget.value)}
					/>
					<Button class={css.submit} disabled={isLocked()} loading={isPending()} type='submit'>Сменить пароль</Button>
				</form>
			</Show>
		</SecuritySection>
	);
}
