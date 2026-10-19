import css from './sign-in-card.module.scss';

import { ApiHttpError } from '@/shared/api';
import { Banner, Button, TextField, Typography } from '@/shared/ui';

import type { AuthClient } from '@/features/auth/api';

import {
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema
} from '@i-finances/contracts';
import { CircleAlert } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';

export type PasswordSignInPanelProps = {
	client: AuthClient;
	onSignedIn: () => void;
	onBack: () => void;
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

/** The password form inside the sign-in card, reached by «Войти по логину и паролю». */
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
			<div class={css.header}>
				<Typography as='h2' variant='heading-2'>Вход по логину и паролю</Typography>
				<Typography tone='secondary' variant='body-md'>
					Резервный способ входа. Пароль не сохраняется на устройстве.
				</Typography>
			</div>
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
				<Show when={formError()}>
					{(content) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{content()}</Banner>}
				</Show>
				<Button fullWidth loading={isPending()} size='lg' type='submit'>Войти</Button>
			</form>
			<Button disabled={isPending()} fullWidth onClick={() => props.onBack()} size='lg' variant='ghost'>
				Другие способы входа
			</Button>
		</div>
	);
}
