import type {
	CurrentSessionResponse
} from '@i-finances/contracts';
import { createResource, createSignal, Show } from 'solid-js';

import { ApiHttpError } from '../../../shared/api';
import type { CategoryClient } from '../../categories';
import { CategoriesView } from '../../categories';
import type { AuthClient } from '../api';

export type AuthViewProps = {
	authClient: AuthClient;
	categoryClient: CategoryClient;
};

export function AuthView(props: AuthViewProps) {
	const [session, { refetch }] = createResource(() => props.authClient.currentSession());

	return (
		<Show when={!session.loading} fallback={<p role='status'>Проверяем сессию…</p>}>
			<Show
				when={session()}
				fallback={<SignInForm client={props.authClient} onSignedIn={refetch}/>}
			>
				{(currentSession) => (
					<AuthenticatedView
						categoryClient={props.categoryClient}
						onSignedOut={refetch}
						session={currentSession()}
						authClient={props.authClient}
					/>
				)}
			</Show>
		</Show>
	);
}

type SignInFormProps = {
	client: AuthClient;
	onSignedIn: () => void;
};

function SignInForm(props: SignInFormProps) {
	const [error, setError] = createSignal<string>();
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setError(undefined);
		setIsSubmitting(true);

		const formData = new FormData(event.currentTarget);

		try {
			const result = await props.client.signIn({
				password: readFormString(formData, 'password'),
				username: readFormString(formData, 'username')
			});

			if (result.ok) {
				props.onSignedIn();
				return;
			}

			setError(result.message);
		}
		catch (caughtError: unknown) {
			setError(
				caughtError instanceof ApiHttpError
					? 'Сервис авторизации временно недоступен.'
					: 'Не удалось войти. Попробуйте ещё раз.'
			);
		}
		finally {
			setIsSubmitting(false);
		}
	};

	return (
		<section aria-labelledby='sign-in-title' class='auth-panel'>
			<p class='eyebrow'>Безопасный доступ</p>
			<h2 id='sign-in-title'>Войти в i-finances</h2>
			<form class='auth-form' onSubmit={handleSubmit}>
				<label>
					<span>Логин</span>
					<input autocomplete='username' name='username' required type='text'/>
				</label>
				<label>
					<span>Пароль</span>
					<input autocomplete='current-password' minlength='12' name='password' required type='password'/>
				</label>
				<Show when={error()}>
					{(message) => <p role='alert'>{message()}</p>}
				</Show>
				<button disabled={isSubmitting()} type='submit'>
					{isSubmitting() ? 'Входим…' : 'Войти'}
				</button>
			</form>
		</section>
	);
}

function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

type AuthenticatedViewProps = {
	authClient: AuthClient;
	categoryClient: CategoryClient;
	onSignedOut: () => void;
	session: CurrentSessionResponse;
};

function AuthenticatedView(props: AuthenticatedViewProps) {
	const [error, setError] = createSignal<string>();

	if (!props.session.authenticated) {
		return null;
	}

	const handleSignOut = async () => {
		setError(undefined);

		try {
			await props.authClient.signOut();
			props.onSignedOut();
		}
		catch {
			setError('Не удалось завершить сессию.');
		}
	};

	return (
		<>
			<section class='user-bar'>
				<div>
					<p class='eyebrow'>Вы вошли как</p>
					<strong>{props.session.user.displayName}</strong>
				</div>
				<button class='secondary-button' onClick={handleSignOut} type='button'>Выйти</button>
			</section>
			<Show when={error()}>
				{(message) => <p role='alert'>{message()}</p>}
			</Show>
			<CategoriesView client={props.categoryClient}/>
		</>
	);
}
