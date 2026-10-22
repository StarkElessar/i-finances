import type { ApiAccessFailure } from '@/shared/api';

import type { CurrentViewer } from '@/entities/viewer';

export type AccessFailureEffects = {
	/** Forgets cached query results, so nothing loaded for the previous access shows up again (back, forward). */
	clearCache: () => void;
	clearCurrentViewer: () => void;
	/** Remembers the name of the household the viewer was in, for «Вы больше не участник окружения «X»» after a new sign-in. */
	rememberLostHousehold: (householdName: string) => void;
	setCurrentViewer: (patch: Partial<CurrentViewer>) => void;
};

/**
 * Applies what an API failure says about access to the viewer snapshot, in place and without refetching the session:
 * 401 forgets the viewer (the guards then lead to the sign-in), 403 `household-required` drops the household (to the
 * onboarding). Repeats change nothing: a page usually fires several requests and all of them fail the same way.
 */
export function applyAccessFailure(
	failure: ApiAccessFailure,
	viewer: CurrentViewer | null | undefined,
	effects: AccessFailureEffects
): void {
	if (viewer === null || viewer === undefined) {
		return;
	}

	if (viewer.household !== null) {
		effects.rememberLostHousehold(viewer.household.name);
	}

	if (failure === 'unauthenticated') {
		effects.clearCurrentViewer();
		effects.clearCache();
		return;
	}

	if (viewer.household !== null) {
		effects.setCurrentViewer({ household: null });
		effects.clearCache();
	}
}
