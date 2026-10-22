import css from './sign-in-shell.module.scss';

import { Typography } from '@/shared/ui';

import { Title } from '@solidjs/meta';
import { Show } from 'solid-js';

import type { AuthClient } from '../api';
import { createSignInMethods } from '../model/create-sign-in-methods';

import { BrandPanel } from './brand-panel';
import { SignInMethods } from './sign-in-methods';

export type SignInFormProps = {
	client: AuthClient;
	/** The session cookie is set: reload the session (the router then leads to the operations or the onboarding). */
	onSignedIn: () => void;
};

/**
 * The sign-in page: Telegram first, the passkey and the password second (mockup `M-SignIn`, `D-SignIn`,
 * `Auth-Telegram`). The Telegram request lives as long as this page, also while the password form is open.
 */
export function SignInForm(props: SignInFormProps) {
	const methods = createSignInMethods(props.client, () => props.onSignedIn());

	return (
		<div class={css.page}>
			<Title>Вход — iFinances</Title>
			<div class={css.frame}>
				<BrandPanel/>
				<div class={css.aside}>
					<div class={css.card}>
						<SignInMethods controller={methods}/>
					</div>
					<Show when={methods.method() === 'options' && methods.view().hasRegistrationHint}>
						<Typography class={css.hint} tone='tertiary' variant='caption'>
							Аккаунт создаётся при первом входе через Telegram.
						</Typography>
					</Show>
				</div>
			</div>
		</div>
	);
}
