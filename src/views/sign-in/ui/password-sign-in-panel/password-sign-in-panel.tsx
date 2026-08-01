import css from './password-sign-in-panel.module.scss';

import { createSignal, Show } from 'solid-js';
import { z } from 'zod';

import { Button, TextField, Typography } from '~/shared/ui';
import {
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema,
	passwordSignInResultSchema
} from '~/views/sign-in/api/password-sign-in.contract';
import { IdentityBadge } from '~/views/sign-in/ui/identity-badge';

/**
 * Navigation callbacks used by the password fallback panel.
 */
export type PasswordSignInPanelProps = {
	initialError?: string;
	onUsePasskey: () => void;
	returnTo?: string;
};

type PasswordSignInFieldErrors = {
	username?: string;
	password?: string;
};

/**
 * Extracts a string value from a form payload.
 */
function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

/**
 * Converts Zod field errors into TextField-compatible messages.
 */
function createFieldErrors(fieldErrors: Record<string, string[] | undefined>): PasswordSignInFieldErrors {
	return {
		username: fieldErrors.username?.[0],
		password: fieldErrors.password?.[0]
	};
}

/**
 * Presents the password fallback form without leaving the sign-in page.
 */
export function PasswordSignInPanel(props: PasswordSignInPanelProps) {
	const [login, setLogin] = createSignal('');
	const [password, setPassword] = createSignal('');
	const [fieldErrors, setFieldErrors] = createSignal<PasswordSignInFieldErrors>({});
	const [formError, setFormError] = createSignal(props.initialError);
	const [isPending, setIsPending] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();

		const form = event.currentTarget;

		if (!(form instanceof HTMLFormElement)) {
			return;
		}

		const formData = new FormData(form);
		const parsedInput = passwordSignInInputSchema.safeParse({
			username: readFormString(formData, 'username'),
			password: readFormString(formData, 'password'),
			returnTo: readFormString(formData, 'returnTo')
		});

		if (!parsedInput.success) {
			setFieldErrors(createFieldErrors(z.flattenError(parsedInput.error).fieldErrors));
			setFormError(passwordSignInErrorMessageByCode['invalid-input']);
			return;
		}

		setFieldErrors({});
		setFormError(undefined);
		setIsPending(true);

		try {
			const response = await fetch(form.action, {
				method: form.method,
				body: formData,
				credentials: 'same-origin',
				headers: {
					accept: 'application/json'
				}
			});
			const parsedResult = passwordSignInResultSchema.safeParse(await response.json());

			if (!parsedResult.success) {
				setFormError(passwordSignInErrorMessageByCode.unexpected);
				return;
			}

			if (parsedResult.data.ok) {
				window.location.assign(parsedResult.data.redirectTo);
				return;
			}

			setFieldErrors(parsedResult.data.fieldErrors ?? {});
			setFormError(parsedResult.data.message);
		}
		catch {
			setFormError(passwordSignInErrorMessageByCode.unexpected);
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

			<form action='/api/auth/password-sign-in' class={css.form} method='post' onSubmit={handleSubmit}>
				<input name='returnTo' type='hidden' value={props.returnTo ?? ''}/>
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
				<Show when={formError()}>
					{(content) => <p class={css.error} role='alert'>{content()}</p>}
				</Show>
				<Button type='submit' fullWidth loading={isPending()}>
					Войти
				</Button>
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
