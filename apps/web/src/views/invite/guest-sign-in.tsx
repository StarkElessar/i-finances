import type { AuthClient } from '@/features/auth';
import { createSignInMethods } from '@/features/auth';
import { InvitationGuestCard, type InvitationScreen, pendingInvitation } from '@/features/invitation';

import { createEffect } from 'solid-js';

type GuestSignInProps = {
	authClient: AuthClient;
	onSignedIn: () => void;
	preview: Extract<InvitationScreen, { kind: 'guest' }>['preview'];
	token: string | undefined;
};

/** The guest card owns the sign-in controller, so a signed-in person never starts a Telegram request here. */
export function GuestSignIn(props: GuestSignInProps) {
	const controller = createSignInMethods(props.authClient, () => handleSignedIn(), props.token);
	const guestController = { ...controller, signOut: () => handleSignOut() };

	const rememberRegistration = (allowUnclaimed = false): void => {
		const state = controller.telegram.state();
		// A restarted sign-in retains the previous session value while the new account is loading.
		const session = controller.isSessionLoading() ? undefined : controller.session();

		if (state.kind !== 'confirmed' || props.token === undefined) {
			return;
		}

		// The complete body may be lost after registration consumed the app invitation and set the session cookie.
		const isRecoveredAppRegistration = state.isRecovered && props.preview.kind === 'app' && !state.hasHousehold;

		if ((state.isNewUser || isRecoveredAppRegistration) && (session?.authenticated || allowUnclaimed)) {
			pendingInvitation.markRegistered(
				props.token,
				props.preview.kind ?? 'household',
				session?.authenticated ? session.user.id : undefined
			);
		}
	};

	const handleSignedIn = (): void => {
		rememberRegistration(true);
		props.onSignedIn();
	};

	const handleSignOut = async (): Promise<void> => {
		const session = controller.session();

		await controller.signOut();
		pendingInvitation.clearRegistration(session?.authenticated ? session.user.id : undefined);

		if (props.token !== undefined) {
			// This guest flow continues with the same invitation; release any binding to the rejected identity.
			pendingInvitation.save(props.token);
		}
	};

	createEffect(() => {
		// Remember the successful registration before the person continues or reloads the identity card.
		rememberRegistration();
	});

	return <InvitationGuestCard controller={guestController} preview={props.preview}/>;
}
