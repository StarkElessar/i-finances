import { INVITATION_PAGE_PATH, type InvitationLinkLocation, readInvitationTokenFromLocation } from '@i-finances/contracts';

import type { PendingInvitationStore } from './pending-invitation-store';

export type ClaimInvitationTokenOptions = {
	/** `window.location` of the invitation page. */
	location: InvitationLinkLocation;
	/** `history.replaceState(history.state, '', path)`: changes the address without a new history entry. */
	replaceAddress: (path: string) => void;
	store: PendingInvitationStore;
};

function isInvitationPage(pathname: string): boolean {
	return pathname === INVITATION_PAGE_PATH || pathname === `${INVITATION_PAGE_PATH}/`;
}

/**
 * Takes the token out of the address bar (decision A6 of Р5): reads it from the fragment of `/invite#<token>` through
 * `readInvitationTokenFromLocation`, moves it into the store and replaces the address with `/invite`, so the token
 * does not stay in the address bar, in a screenshot or in the history entry of this tab. Other pages are left alone.
 *
 * A fragment that is not a well-formed token (a link cut by a messenger) is dropped from the address too, and it also
 * drops a token remembered earlier in the tab: the person opened this link, so the page must say that this link is
 * damaged, not open an older invitation instead (review of U4).
 *
 * Returns the token of the address, or `undefined` when the address carries none (a reload of the clean `/invite`,
 * the return after a sign-in) or a damaged one: the caller then asks the store.
 */
export function claimInvitationTokenFromAddress(options: ClaimInvitationTokenOptions): string | undefined {
	if (!isInvitationPage(options.location.pathname) || options.location.hash === '') {
		return undefined;
	}

	const token = readInvitationTokenFromLocation(options.location);

	if (token === undefined) {
		options.store.clear();
	}
	else {
		options.store.save(token);
	}

	options.replaceAddress(INVITATION_PAGE_PATH);

	return token;
}
