import type { Accessor, JSX } from 'solid-js';
import { createContext, createSignal, useContext } from 'solid-js';

import type { CurrentViewer } from './types';

export type CurrentViewerAccessor = Accessor<CurrentViewer | null | undefined>;
export type SetCurrentViewer = (patch: Partial<CurrentViewer>) => void;

const CurrentViewerContext = createContext<CurrentViewerAccessor>(() => undefined);
const SetCurrentViewerContext = createContext<SetCurrentViewer>(() => {});

/**
 * Provides the current authenticated user snapshot to app shell widgets.
 *
 * Holds a small local override on top of the session-derived snapshot so a
 * field (e.g. display name) can be patched in place after a save — without
 * refetching the whole session, which would recreate this provider's parent
 * tree and reset unrelated local UI state (like an open settings dialog).
 */
export function CurrentViewerProvider(props: {
	children: JSX.Element;
	viewer: CurrentViewerAccessor;
}) {
	const [override, setOverride] = createSignal<Partial<CurrentViewer>>({});

	const viewer: CurrentViewerAccessor = () => {
		const base = props.viewer();

		return base ? { ...base, ...override() } : base;
	};

	const setCurrentViewer: SetCurrentViewer = (patch) => {
		setOverride((current) => ({ ...current, ...patch }));
	};

	return (
		<CurrentViewerContext.Provider value={viewer}>
			<SetCurrentViewerContext.Provider value={setCurrentViewer}>
				{props.children}
			</SetCurrentViewerContext.Provider>
		</CurrentViewerContext.Provider>
	);
}

/**
 * Returns the current authenticated user snapshot accessor.
 */
export function useCurrentViewer(): CurrentViewerAccessor {
	return useContext(CurrentViewerContext);
}

/**
 * Returns a setter that patches the current viewer snapshot in place.
 */
export function useSetCurrentViewer(): SetCurrentViewer {
	return useContext(SetCurrentViewerContext);
}
