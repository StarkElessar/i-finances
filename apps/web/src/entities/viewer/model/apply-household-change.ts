import type { HouseholdSummary } from '@i-finances/contracts';

import type { CurrentViewer } from './types';

export type HouseholdChangeEffects = {
	/** Forgets cached query results: their keys carry no household, so they would show the old household's data. */
	clearCache: () => void;
	setCurrentViewer: (patch: Partial<CurrentViewer>) => void;
};

/**
 * The viewer moved to another household or out of one (accepted an invitation, created a household, left): the cache
 * goes first, then the viewer is patched in place. Never a session refetch (memory `viewer-refetch-remount-bug`).
 * The order matters: the patch re-renders the routes at once, and they must not find the previous household's lists.
 */
export function applyHouseholdChange(household: HouseholdSummary | null, effects: HouseholdChangeEffects): void {
	effects.clearCache();
	effects.setCurrentViewer({ household });
}
