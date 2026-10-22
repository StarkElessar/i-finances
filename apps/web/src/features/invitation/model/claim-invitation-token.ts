import { INVITATION_PAGE_PATH, type InvitationLinkLocation, readInvitationTokenFromLocation } from '@i-finances/contracts';

import type { PendingInvitationStore } from './pending-invitation-store';

export type ClaimInvitationTokenOptions = {
	/** `window.location` of the invitation page. */
	location: InvitationLinkLocation;
	/** `history.replaceState(history.state, '', path)`: changes the address without a new history entry. */
	replaceAddress: (path: string) => void;
	store: PendingInvitationStore;
};

/**
 * Takes the token out of the address bar (decision A6 of Р5): reads it from the fragment of `/invite#<token>` through
 * `readInvitationTokenFromLocation`, moves it into the store and replaces the address with `/invite`, so the token
 * does not stay in the address bar, in a screenshot or in the history entry of this tab. A fragment that is not a
 * well-formed token is dropped from the address too, but is not stored.
 *
 * Returns the token of the address, or `undefined` when the address carries none (a reload of the clean `/invite`,
 * the return after a sign-in): the caller then asks the store.
 */
export function claimInvitationTokenFromAddress(options: ClaimInvitationTokenOptions): string | undefined {
	const token = readInvitationTokenFromLocation(options.location);

	if (token !== undefined) {
		options.store.save(token);
	}

	if (options.location.hash !== '') {
		options.replaceAddress(INVITATION_PAGE_PATH);
	}

	return token;
}
