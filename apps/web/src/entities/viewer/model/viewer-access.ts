import type { CurrentSessionResponse } from '@i-finances/contracts';

import type { CurrentViewer } from './types';

/**
 * Where the viewer stands: not signed in, signed in without a household (onboarding), or a household member.
 * Only a member may see finance pages; the other two never reach them (Р4).
 */
export type ViewerAccess = 'anonymous' | 'member' | 'onboarding';

export function viewerFromSession(session: CurrentSessionResponse): CurrentViewer | null {
	if (!session.authenticated) {
		return null;
	}

	return {
		displayName: session.user.displayName,
		household: session.household,
		id: session.user.id,
		username: session.user.username
	};
}

export function resolveViewerAccess(viewer: CurrentViewer | null | undefined): ViewerAccess {
	if (viewer === null || viewer === undefined) {
		return 'anonymous';
	}

	return viewer.household === null ? 'onboarding' : 'member';
}
