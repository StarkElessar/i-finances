import type { ViewerAccess } from '@/entities/viewer';

import { INVITATION_PAGE_PATH } from '@i-finances/contracts';

/** What a route serves: one access, or every viewer (the invitation page works for a guest, a newcomer and a member). */
export type RouteAccess = 'any' | ViewerAccess;

/**
 * The one entry page of each access: the sign-in for a guest, the onboarding for a user without a household, the
 * operations for a member.
 */
export const ENTRY_PATH_BY_ACCESS: Record<ViewerAccess, string> = {
	anonymous: '/sign-in',
	member: '/',
	onboarding: '/onboarding'
};

export type RouteRedirectOptions = {
	/** An invitation token waits in the tab (`PendingInvitationStore`): a sign-in leads back to it. */
	hasPendingInvitation?: boolean;
};

/**
 * Where a viewer goes from a route that serves `routeAccess`: nowhere (`null`) when the route is theirs, otherwise to
 * the entry page of their own access. Every entry page serves exactly that access, so a redirect always lands on a
 * page that keeps the viewer: there is no chain and no loop. A guest never sees a finance page, and neither does a
 * user without a household: the page is not rendered at all, so it neither asks for data nor shows any.
 *
 * Two exceptions to «the entry page». A route for `any` access keeps everyone. And a person who has just signed in on
 * the sign-in page while an invitation token waits in the tab goes back to the invitation (`/invite` serves every
 * access, so this is no loop either), not to the onboarding or the operations: the invitation was the reason to sign in.
 */
export function resolveRouteRedirect(
	routeAccess: RouteAccess,
	viewerAccess: ViewerAccess,
	options: RouteRedirectOptions = {}
): string | null {
	if (routeAccess === 'any' || routeAccess === viewerAccess) {
		return null;
	}

	if (routeAccess === 'anonymous' && options.hasPendingInvitation === true) {
		return INVITATION_PAGE_PATH;
	}

	return ENTRY_PATH_BY_ACCESS[viewerAccess];
}
