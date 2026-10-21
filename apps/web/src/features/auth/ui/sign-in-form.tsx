import css from './sign-in-shell.module.scss';

import { Typography } from '@/shared/ui';

import { Title } from '@solidjs/meta';
import { createMemo, createResource, createSignal, Match, Show, Switch } from 'solid-js';

import type { AuthClient } from '../api';
import { createPasskeySignIn } from '../model/create-passkey-sign-in';
import { createTelegramSignIn } from '../model/create-telegram-sign-in';
import { describeSignInCard } from '../model/sign-in-card-view';

import { BrandPanel } from './brand-panel';
import { PasswordSignInPanel } from './password-sign-in-panel';
import { SignInOptions } from './sign-in-options';
import { readSignedInIdentity, SignedInIdentity } from './signed-in-identity';

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
	const [method, setMethod] = createSignal<'options' | 'password'>('options');
	const telegram = createTelegramSignIn(props.client);
	const passkey = createPasskeySignIn(props.client, () => props.onSignedIn());
	const view = createMemo(() => describeSignInCard(telegram.state()));
	const botUrl = () => {
		const state = telegram.state();

		return state.kind === 'ready' || state.kind === 'waiting' ? state.link.botUrl : undefined;
	};
	const isConfirmed = () => telegram.state().kind === 'confirmed';
	const [session] = createResource(
		() => isConfirmed() || undefined,
		() => props.client.currentSession()
	);

	const handleSignOut = async (): Promise<void> => {
		await props.client.signOut();
		setMethod('options');
		telegram.start();
	};

	return (
		<div class={css.page}>
			<Title>Вход — iFinances</Title>
			<div class={css.frame}>
				<BrandPanel/>
				<div class={css.aside}>
					<div class={css.card}>
						<Switch>
							<Match when={isConfirmed()}>
								<SignedInIdentity
									identity={readSignedInIdentity(session.error ? undefined : session())}
									isLoading={session.loading}
									onContinue={() => props.onSignedIn()}
									onSignOut={handleSignOut}
								/>
							</Match>
							<Match when={method() === 'password'}>
								<PasswordSignInPanel
									client={props.client}
									onBack={() => setMethod('options')}
									onSignedIn={() => props.onSignedIn()}
								/>
							</Match>
							<Match when={method() === 'options'}>
								<SignInOptions
									botUrl={botUrl()}
									isPasskeyPending={passkey.isPending()}
									onCancel={() => telegram.cancel()}
									onOpenTelegram={() => telegram.openTelegram()}
									onPasskey={() => void passkey.signIn()}
									onRestart={() => telegram.start()}
									onUsePassword={() => setMethod('password')}
									passkeyError={passkey.error()}
									view={view()}
								/>
							</Match>
						</Switch>
					</div>
					<Show when={method() === 'options' && view().hasRegistrationHint}>
						<Typography class={css.hint} tone='tertiary' variant='caption'>
							Аккаунт создаётся при первом входе через Telegram.
						</Typography>
					</Show>
				</div>
			</div>
		</div>
	);
}
