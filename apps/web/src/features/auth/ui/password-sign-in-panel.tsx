import css from './password-sign-in-panel.module.scss';

import { ApiHttpError } from '@/shared/api';
import { Button, TextField, Typography } from '@/shared/ui';

import type { AuthClient } from '@/features/auth/api';

import {
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema
} from '@i-finances/contracts';
import { createSignal, Show } from 'solid-js';

import { IdentityBadge } from './identity-badge';

export type PasswordSignInPanelProps = {
	client: AuthClient;
	onSignedIn: () => void;
	onUsePasskey: () => void;
};

type PasswordSignInFieldErrors = {
	username?: string;
	password?: string;
};

function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

function createFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): PasswordSignInFieldErrors {
	const fieldErrors: PasswordSignInFieldErrors = {};

	for (const issue of issues) {
		const fieldName = issue.path[0];

		if (fieldName === 'username' || fieldName === 'password') {
			fieldErrors[fieldName] = issue.message;
		}
	}

	return fieldErrors;
}

export function PasswordSignInPanel(props: PasswordSignInPanelProps) {
	const [login, setLogin] = createSignal('');
	const [password, setPassword] = createSignal('');
	const [fieldErrors, setFieldErrors] = createSignal<PasswordSignInFieldErrors>({});
	const [formError, setFormError] = createSignal<string>();
	const [isPending, setIsPending] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		const form = event.currentTarget;

		if (!(form instanceof HTMLFormElement)) {
			return;
		}

		const parsedInput = passwordSignInInputSchema.safeParse({
			username: readFormString(new FormData(form), 'username'),
			password: readFormString(new FormData(form), 'password')
		});

		if (!parsedInput.success) {
			setFieldErrors(createFieldErrors(parsedInput.error.issues));
			setFormError(passwordSignInErrorMessageByCode['invalid-input']);
			return;
		}

		setFieldErrors({});
		setFormError(undefined);
		setIsPending(true);

		try {
			const result = await props.client.signIn(parsedInput.data);

			if (result.ok) {
				props.onSignedIn();
				return;
			}

			setFieldErrors(result.fieldErrors ?? {});
			setFormError(result.message);
		}
		catch (error: unknown) {
			setFormError(error instanceof ApiHttpError
				? 'Сервис авторизации временно недоступен.'
				: passwordSignInErrorMessageByCode.unexpected);
		}
		finally {
			setIsPending(false);
		}
	};

	return (
		<div class={css.root}>
			<IdentityBadge/>
			<Typography as='h2' class={css.title} variant='heading-1'>Войти в аккаунт</Typography>
			<Typography class={css.description} variant='body-lg' tone='secondary'>
				Используйте данные резервного входа. После авторизации можно создать ключ доступа.
			</Typography>
			<form class={css.form} onSubmit={handleSubmit}>
				<TextField
					autocomplete='username'
					disabled={isPending()}
					error={fieldErrors().username}
					label='Логин'
					name='username'
					onInput={(event) => setLogin(event.currentTarget.value)}
					placeholder='Введите логин'
					required
					value={login()}
				/>
				<TextField
					autocomplete='current-password'
					disabled={isPending()}
					error={fieldErrors().password}
					hint={fieldErrors().password ? undefined : 'Не менее 12 символов'}
					label='Пароль'
					name='password'
					onInput={(event) => setPassword(event.currentTarget.value)}
					placeholder='Введите пароль'
					required
					type='password'
					value={password()}
				/>
				<Show when={formError()}>{(content) => <p class={css.error} role='alert'>{content()}</p>}</Show>
				<Button type='submit' fullWidth loading={isPending()}>Войти</Button>
			</form>
			<div class={css.or} data-text='или'/>
			<Button type='button' fullWidth variant='secondary' disabled={isPending()} onClick={props.onUsePasskey}>
				Вернуться к входу с ключом доступа
			</Button>
			<Typography class={css.notice} variant='body-sm' tone='secondary'>
				Пароль не сохраняется на устройстве.
			</Typography>
		</div>
	);
}
