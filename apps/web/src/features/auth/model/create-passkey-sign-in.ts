import { passkeySignInErrorMessageByCode } from '@i-finances/contracts';
import type { Accessor } from 'solid-js';
import { createSignal } from 'solid-js';

import type { AuthClient } from '../api';

export type PasskeySignIn = {
	error: Accessor<string | undefined>;
	isPending: Accessor<boolean>;
	signIn: () => Promise<void>;
};

/** Sign-in with a passkey (WebAuthn without a user name); `onSignedIn` runs once the session cookie is set. */
export function createPasskeySignIn(client: AuthClient, onSignedIn: () => void): PasskeySignIn {
	const [error, setError] = createSignal<string>();
	const [isPending, setIsPending] = createSignal(false);

	const signIn = async (): Promise<void> => {
		if (!client.supportsPasskeys()) {
			setError(passkeySignInErrorMessageByCode['not-supported']);
			return;
		}

		setError(undefined);
		setIsPending(true);

		try {
			const result = await client.signInWithPasskey();

			if (result.ok) {
				onSignedIn();
				return;
			}

			setError(result.message);
		}
		catch (caughtError: unknown) {
			setError(
				caughtError instanceof DOMException && caughtError.name === 'NotAllowedError'
					? passkeySignInErrorMessageByCode.cancelled
					: passkeySignInErrorMessageByCode.unexpected
			);
		}
		finally {
			setIsPending(false);
		}
	};

	return { error, isPending, signIn };
}
