import type { ViewerAccess } from '@/entities/viewer';

/**
 * The one entry page of each access: the sign-in for a guest, the onboarding for a user without a household, the
 * operations for a member.
 */
export const ENTRY_PATH_BY_ACCESS: Record<ViewerAccess, string> = {
	anonymous: '/sign-in',
	member: '/',
	onboarding: '/onboarding'
};

/**
 * Where a viewer goes from a route that serves `routeAccess`: nowhere (`null`) when the route is theirs, otherwise to
 * the entry page of their own access. Every entry page serves exactly that access, so a redirect always lands on a
 * page that keeps the viewer: there is no chain and no loop. A guest never sees a finance page, and neither does a
 * user without a household: the page is not rendered at all, so it neither asks for data nor shows any.
 */
export function resolveRouteRedirect(routeAccess: ViewerAccess, viewerAccess: ViewerAccess): string | null {
	return routeAccess === viewerAccess ? null : ENTRY_PATH_BY_ACCESS[viewerAccess];
}
