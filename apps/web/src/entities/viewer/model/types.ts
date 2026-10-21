import type { HouseholdSummary } from '@i-finances/contracts';

/**
 * Minimal authenticated user snapshot safe for client UI.
 */
export type CurrentViewer = {
	displayName: string;
	/** `null` while the user has no household (onboarding); every household route answers 403 then. */
	household: HouseholdSummary | null;
	id: string;
	username: string;
};
