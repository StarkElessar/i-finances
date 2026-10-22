export type SignedOutUserStores = {
	/** `householdLossNotice`: the notice about a household the user lost. */
	householdLossNotice: { clear: () => void };
	/** `pendingInvitation`: the invitation waiting in the tab. */
	pendingInvitation: { clear: () => void };
};

/**
 * An explicit sign-out: what the tab kept for the person who leaves goes with them, so the next one to sign in here
 * gets neither their invitation nor the name of their lost household (review of U3, U4). The stores also check the
 * user on every read; this is the first line, and the one that matters when the same person comes back.
 */
export function forgetSignedOutUser(stores: SignedOutUserStores): void {
	stores.pendingInvitation.clear();
	stores.householdLossNotice.clear();
}
