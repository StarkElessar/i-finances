import type { CurrentSessionResponse } from '@i-finances/contracts';
import type { Accessor } from 'solid-js';
import { createMemo, createResource, createSignal } from 'solid-js';

import type { AuthClient } from '../api';

import { createPasskeySignIn, type PasskeySignIn } from './create-passkey-sign-in';
import { createTelegramSignIn, type TelegramSignIn } from './create-telegram-sign-in';
import { describeSignInCard, type SignInCardView } from './sign-in-card-view';

export type SignInMethodsController = {
	/** The bot link of this browser's own request, while there is one. */
	botUrl: Accessor<string | undefined>;
	client: AuthClient;
	/** Telegram has confirmed the sign-in; the card shows who signed in (`SignedInIdentity`). */
	isConfirmed: Accessor<boolean>;
	/** The session read after a confirmed Telegram sign-in is still on its way. */
	isSessionLoading: Accessor<boolean>;
	method: Accessor<'options' | 'password'>;
	onSignedIn: () => void;
	passkey: PasskeySignIn;
	/** The session after a confirmed Telegram sign-in; `undefined` while loading or when it could not be read. */
	session: Accessor<CurrentSessionResponse | undefined>;
	setMethod: (method: 'options' | 'password') => void;
	signOut: () => Promise<void>;
	telegram: TelegramSignIn;
	view: Accessor<SignInCardView>;
};

/**
 * The state shared by everything that signs a person in: the Telegram request (which lives as long as the owner of this
 * controller, also while the password form is open), the passkey and the password. The sign-in page and the guest card of
 * the invitation both use it, each with its own frame; the states are the same (board `Auth-Telegram`).
 */
export function createSignInMethods(client: AuthClient, onSignedIn: () => void, invitationToken?: string): SignInMethodsController {
	const [method, setMethod] = createSignal<'options' | 'password'>('options');
	const telegram = createTelegramSignIn(client, invitationToken);
	const passkey = createPasskeySignIn(client, () => onSignedIn());
	const view = createMemo(() => describeSignInCard(telegram.state()));
	const botUrl = () => {
		const state = telegram.state();

		return state.kind === 'ready' || state.kind === 'waiting' ? state.link.botUrl : undefined;
	};
	const isConfirmed = () => telegram.state().kind === 'confirmed';
	const [session] = createResource(
		() => isConfirmed() || undefined,
		() => client.currentSession()
	);

	const signOut = async (): Promise<void> => {
		await client.signOut();
		setMethod('options');
		telegram.start();
	};

	return {
		botUrl,
		client,
		isConfirmed,
		isSessionLoading: () => session.loading,
		method,
		onSignedIn,
		passkey,
		session: () => (session.error ? undefined : session()),
		setMethod,
		signOut,
		telegram,
		view
	};
}
