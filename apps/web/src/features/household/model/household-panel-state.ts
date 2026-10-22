import type { ActiveHouseholdInvitation, CreatedHouseholdInvitation, HouseholdDetails, HouseholdMember } from '@i-finances/contracts';

/** What the person is asked to confirm inside the dialog (kit rule: confirmation inside the dialog, not above it). */
export type HouseholdConfirmation =
	| { kind: 'leave' }
	| { kind: 'remove'; member: Pick<HouseholdMember, 'displayName' | 'userId'> };

/** The request that is running; one at a time. `revoke` and `remove` name the row. */
export type HouseholdBusy =
	| { kind: 'create-invitation' }
	| { kind: 'leave' }
	| { kind: 'remove'; userId: string }
	| { kind: 'rename' }
	| { id: string; kind: 'revoke' };

export type HouseholdPanelState = {
	busy?: HouseholdBusy;
	/** Why the pending confirmation failed (a 409, the network); shown inside the confirmation. */
	confirmError?: string;
	confirmation?: HouseholdConfirmation;
	/** The invitation created a moment ago: the only time its link exists in the page. Forgotten with `dismissCreatedInvitation`. */
	createdInvitation?: CreatedHouseholdInvitation;
	household?: HouseholdDetails;
	/** Why the creation of an invitation failed (the limit of three, the network). */
	inviteError?: string;
	/** The active invitations of an owner; `undefined` for a member and until they are loaded. */
	invitations?: ActiveHouseholdInvitation[];
	/** Why the list of invitations could not be loaded. */
	invitationsError?: string;
	/** `failed` carries `loadError`; `loading` is the first request. */
	load: 'failed' | 'loading' | 'ready';
	loadError?: string;
	/** Why the rename failed. */
	renameError?: string;
	/** Why the revocation of an invitation failed. */
	revokeError?: string;
};
