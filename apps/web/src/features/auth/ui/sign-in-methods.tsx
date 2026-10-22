import type { JSX } from 'solid-js';
import { Match, Switch } from 'solid-js';

import type { SignInMethodsController } from '../model/create-sign-in-methods';

import { PasswordSignInPanel } from './password-sign-in-panel';
import { SignInOptions } from './sign-in-options';
import { readSignedInIdentity, SignedInIdentity } from './signed-in-identity';

export type SignInMethodsProps = {
	controller: SignInMethodsController;
	/**
	 * Replaces the title and the description of the options card (the invitation says «Сергей приглашает вас…» there).
	 * The password form and the signed-in card keep their own titles.
	 */
	header?: JSX.Element;
	/** Without the «или» line between Telegram and the other ways (the guest card of the invitation has none). */
	hideDivider?: boolean;
};

/**
 * What the sign-in card holds: the ways to sign in, the password form, or, after a confirmed Telegram sign-in, who is
 * now signed in. The frame around it is the caller's.
 */
export function SignInMethods(props: SignInMethodsProps) {
	return (
		<Switch>
			<Match when={props.controller.isConfirmed()}>
				<SignedInIdentity
					identity={readSignedInIdentity(props.controller.session())}
					isLoading={props.controller.isSessionLoading()}
					onContinue={() => props.controller.onSignedIn()}
					onSignOut={props.controller.signOut}
				/>
			</Match>
			<Match when={props.controller.method() === 'password'}>
				<PasswordSignInPanel
					client={props.controller.client}
					onBack={() => props.controller.setMethod('options')}
					onSignedIn={() => props.controller.onSignedIn()}
				/>
			</Match>
			<Match when={props.controller.method() === 'options'}>
				<SignInOptions
					botUrl={props.controller.botUrl()}
					header={props.header}
					hideDivider={props.hideDivider}
					isPasskeyPending={props.controller.passkey.isPending()}
					onCancel={() => props.controller.telegram.cancel()}
					onOpenTelegram={() => props.controller.telegram.openTelegram()}
					onPasskey={() => void props.controller.passkey.signIn()}
					onRestart={() => props.controller.telegram.start()}
					onUsePassword={() => props.controller.setMethod('password')}
					passkeyError={props.controller.passkey.error()}
					view={props.controller.view()}
				/>
			</Match>
		</Switch>
	);
}
