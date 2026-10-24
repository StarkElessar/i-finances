import type { CurrentViewer } from '@/entities/viewer';
import { viewerFromSession } from '@/entities/viewer';

import type { CurrentSessionResponse } from '@i-finances/contracts';

export type SessionChange = {
	clearCache: boolean;
	viewer: CurrentViewer | null;
};

/**
 * Cached queries belong to a user, so a sign-in, sign-out or switch of user forgets them before adopting the viewer.
 * Changes of the same user keep the cache; their viewer fields can be patched in place with `useSetCurrentViewer`.
 */
export function resolveSessionChange(previous: CurrentViewer | null | undefined, session: CurrentSessionResponse): SessionChange {
	const viewer = viewerFromSession(session);

	return {
		clearCache: previous?.id !== viewer?.id,
		viewer
	};
}
