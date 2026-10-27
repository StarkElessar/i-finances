import type { HouseholdSummary, InvitationKind, InvitationPreview } from '@i-finances/contracts';

import type { InvitationFlowState, InvitationRequestProblem, InvitationUnavailableCause } from './invitation-state';

/**
 * The card the invitation page shows: the flow state seen through «is the person signed in». One entry per card of the
 * boards `Flow-Invite` (numbers in the comments) and `Flow-AppInvite`.
 */
export type InvitationScreen =
	/** 3, 7: a signed-in person is asked «Присоединиться?», with the failure of the last attempt if there was one. */
	| { isAccepting: boolean; kind: 'confirm'; preview: InvitationPreview; problem?: { kind: InvitationRequestProblem; message: string } }
	/** 1: a guest who is not signed in. */
	| { kind: 'guest'; preview: InvitationPreview }
	/** Flow-AppInvite: this account already exists, so the invitation is not spent. */
	| { kind: 'already-registered' }
	/** The app invitation was consumed at registration: continue without previewing the spent token. */
	| { kind: 'create-household' }
	/** 5: the person is in another household. */
	| { currentHouseholdName: string | undefined; kind: 'already-in-household' }
	/** 4: joined. */
	| { household: HouseholdSummary; kind: 'accepted' }
	/** The invitation is being checked. */
	| { kind: 'loading' }
	/** The check failed in a way that can be repeated. */
	| { kind: 'preview-failed'; message: string; problem: InvitationRequestProblem }
	/** 6: consent to delete the person's own empty household. */
	| {
		currentHouseholdName: string | undefined;
		error?: string;
		isAccepting: boolean;
		kind: 'replace';
		preview: InvitationPreview;
	}
	/** 2: the link opens nothing. */
	| { cause: InvitationUnavailableCause; kind: 'unavailable' };

/**
 * Chooses the card for the flow state. A guest never gets past the sign-in card while the invitation is live; a dead
 * link, the check and its failure look the same for everyone.
 */
export function describeInvitationScreen(
	state: InvitationFlowState,
	isSignedIn: boolean,
	registrationKind?: InvitationKind
): InvitationScreen {
	if (isSignedIn && registrationKind === 'app') {
		return { kind: 'create-household' };
	}

	if (isSignedIn && 'preview' in state && state.preview.kind === 'app') {
		return { kind: 'already-registered' };
	}

	switch (state.kind) {
		case 'loading':
			return { kind: 'loading' };

		case 'preview-failed':
			return { kind: 'preview-failed', message: state.message, problem: state.problem };

		case 'unavailable':
			return { cause: state.cause, kind: 'unavailable' };

		case 'accepted':
			return { household: state.household, kind: 'accepted' };

		case 'ready':
			return isSignedIn
				? { isAccepting: false, kind: 'confirm', preview: state.preview }
				: { kind: 'guest', preview: state.preview };

		case 'accepting':
			if (!isSignedIn) {
				return { kind: 'guest', preview: state.preview };
			}

			return state.replacing === undefined
				? { isAccepting: true, kind: 'confirm', preview: state.preview }
				: {
					currentHouseholdName: state.replacing.currentHouseholdName,
					isAccepting: true,
					kind: 'replace',
					preview: state.preview
				};

		case 'accept-failed':
			return isSignedIn
				? {
					isAccepting: false,
					kind: 'confirm',
					preview: state.preview,
					problem: { kind: state.problem, message: state.message }
				}
				: { kind: 'guest', preview: state.preview };

		case 'confirm-replace':
			return isSignedIn
				? {
					currentHouseholdName: state.currentHouseholdName,
					error: state.error,
					isAccepting: false,
					kind: 'replace',
					preview: state.preview
				}
				: { kind: 'guest', preview: state.preview };

		case 'already-in-household':
			return isSignedIn
				? { currentHouseholdName: state.currentHouseholdName, kind: 'already-in-household' }
				: { kind: 'guest', preview: state.preview };
	}
}
