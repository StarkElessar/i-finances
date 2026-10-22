import type { InvitationLinkLocation } from '@i-finances/contracts';

import { claimInvitationTokenFromAddress } from './claim-invitation-token';
import type { PendingInvitationStore } from './pending-invitation-store';

/** The part of `window` the claim needs; a test passes a plain object. */
export type InvitationAddressWindow = {
	addEventListener: (type: 'hashchange', listener: () => void) => void;
	history: Pick<History, 'replaceState' | 'state'>;
	location: InvitationLinkLocation & Pick<Location, 'reload'>;
};

/**
 * Takes an invitation token out of the address as soon as the app starts, before the session is even asked for
 * (review of U4): the invitation page is rendered only after the session check, and a slow or failed check must not
 * leave the token in the address bar. A link pasted into a tab that already shows `/invite` changes only the fragment,
 * which loads nothing; the token is taken out the same way and the page is reloaded to open that invitation.
 */
export function installInvitationAddressClaim(target: InvitationAddressWindow, store: PendingInvitationStore): void {
	const claim = (): void => {
		claimInvitationTokenFromAddress({
			location: target.location,
			replaceAddress: (path) => target.history.replaceState(target.history.state, '', path),
			store
		});
	};

	claim();
	target.addEventListener('hashchange', () => {
		const fragment = target.location.hash;

		claim();

		if (fragment !== '' && target.location.hash === '') {
			target.location.reload();
		}
	});
}
