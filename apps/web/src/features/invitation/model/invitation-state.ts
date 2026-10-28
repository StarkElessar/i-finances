import type { HouseholdInvitationUnavailableReason, HouseholdSummary, InvitationPreview } from '@i-finances/contracts';

/**
 * Why the page cannot offer the invitation: the four `reason`s of the API (board `Flow-Invite`, decision of
 * 2026-10-19 in Р5), a malformed token, no `reason` (an older API), or a registration that just spent the app link.
 */
export type InvitationUnavailableCause = HouseholdInvitationUnavailableReason | 'malformed' | 'unspecified' | 'used-for-registration';

/** The person's own empty household, named by the API with the refusal that asks for consent. */
export type OwnEmptyHousehold = { currentHouseholdName: string | undefined };

/** What went wrong with a request that can be repeated. */
export type InvitationRequestProblem = 'network' | 'rate-limited' | 'unexpected';

/**
 * Where the invitation page stands. `preview` is the names of the household and the inviter, known without a session;
 * the states that need the person to be signed in (`accepting` and after) are reached only from `ready`.
 */
export type InvitationFlowState =
	/** Waiting for the preview. */
	| { kind: 'loading' }
	/** The preview could not be loaded (the network, too many requests); can be repeated. */
	| { kind: 'preview-failed'; message: string; problem: InvitationRequestProblem }
	/** The link opens nothing; the token is forgotten. */
	| { cause: InvitationUnavailableCause; kind: 'unavailable' }
	/** The invitation is active: a guest signs in, a signed-in person presses «Присоединиться». */
	| { kind: 'ready'; preview: InvitationPreview }
	/** `replacing` is set when the person has consented to the deletion of their empty household (card 6). */
	| { kind: 'accepting'; preview: InvitationPreview; replacing?: OwnEmptyHousehold }
	/** The accept request failed in a way that can be repeated (card 7). */
	| { kind: 'accept-failed'; message: string; preview: InvitationPreview; problem: InvitationRequestProblem }
	/** Card 6: the person's own empty household will be deleted if they agree. */
	| { currentHouseholdName: string | undefined; error?: string; kind: 'confirm-replace'; preview: InvitationPreview }
	/** Card 5: the person is in another household and cannot be moved. */
	| { currentHouseholdName: string | undefined; kind: 'already-in-household'; preview: InvitationPreview }
	/** Card 4: joined as a member. */
	| { household: HouseholdSummary; kind: 'accepted' };
