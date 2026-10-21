import { resolveViewerAccess, useCurrentViewer, type ViewerAccess } from '@/entities/viewer';

import { Navigate } from '@solidjs/router';
import type { JSX } from 'solid-js';
import { createMemo, Show } from 'solid-js';

import { resolveRouteRedirect } from './route-redirect';

export type AccessGuardProps = {
	/** The access this route serves; every other viewer is sent to the entry page of their own access. */
	access: ViewerAccess;
	children: JSX.Element;
};

/**
 * Renders the route only for the viewer it serves. It follows the viewer snapshot, so a 401 or 403
 * `household-required` that patches the snapshot leaves the page at once, without a session refetch.
 */
export function AccessGuard(props: AccessGuardProps) {
	const viewer = useCurrentViewer();
	const redirect = createMemo(() => resolveRouteRedirect(props.access, resolveViewerAccess(viewer())));

	return (
		<Show fallback={props.children} keyed when={redirect()}>
			{(href) => <Navigate href={href}/>}
		</Show>
	);
}
