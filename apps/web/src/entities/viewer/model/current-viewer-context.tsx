import type { Accessor, JSX } from 'solid-js';
import { createContext, createSignal, untrack, useContext } from 'solid-js';

import type { CurrentViewer } from './types';

export type CurrentViewerAccessor = Accessor<CurrentViewer | null | undefined>;
export type SetCurrentViewer = (patch: Partial<CurrentViewer>) => void;
export type ClearCurrentViewer = () => void;

const CurrentViewerContext = createContext<CurrentViewerAccessor>(() => undefined);
const SetCurrentViewerContext = createContext<SetCurrentViewer>(() => {});
const ClearCurrentViewerContext = createContext<ClearCurrentViewer>(() => {});

/**
 * Provides the current user snapshot (`null` when nobody is signed in) to the whole app.
 *
 * The snapshot starts from the session the app loaded and is then patched in place: a saved display name, a household
 * that was lost (403 `household-required`) or created, a session that ended (401). Refetching the whole session
 * instead would recreate the tree under the session gate and reset unrelated local UI state, such as an open
 * settings dialog (memory `viewer-refetch-remount-bug`). A full refetch is only for a change of user: sign-in and
 * sign-out.
 */
export function CurrentViewerProvider(props: {
	children: JSX.Element;
	initialViewer: CurrentViewer | null;
}) {
	// The provider is recreated with every loaded session, so the initial value is read once.
	const [viewer, setViewer] = createSignal<CurrentViewer | null>(untrack(() => props.initialViewer));

	const setCurrentViewer: SetCurrentViewer = (patch) => {
		setViewer((current) => (current === null ? current : { ...current, ...patch }));
	};

	const clearCurrentViewer: ClearCurrentViewer = () => {
		setViewer(null);
	};

	return (
		<CurrentViewerContext.Provider value={viewer}>
			<SetCurrentViewerContext.Provider value={setCurrentViewer}>
				<ClearCurrentViewerContext.Provider value={clearCurrentViewer}>
					{props.children}
				</ClearCurrentViewerContext.Provider>
			</SetCurrentViewerContext.Provider>
		</CurrentViewerContext.Provider>
	);
}

/**
 * Returns the current user snapshot accessor: `null` when nobody is signed in.
 */
export function useCurrentViewer(): CurrentViewerAccessor {
	return useContext(CurrentViewerContext);
}

/**
 * Returns a setter that patches the current viewer snapshot in place. Does nothing when nobody is signed in.
 */
export function useSetCurrentViewer(): SetCurrentViewer {
	return useContext(SetCurrentViewerContext);
}

/**
 * Returns a function that forgets the viewer locally, for a session the server no longer accepts (401).
 */
export function useClearCurrentViewer(): ClearCurrentViewer {
	return useContext(ClearCurrentViewerContext);
}
