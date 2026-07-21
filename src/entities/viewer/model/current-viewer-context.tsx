import type { Accessor, JSX } from 'solid-js';
import { createContext, useContext } from 'solid-js';

import type { CurrentViewer } from './types';

export type CurrentViewerAccessor = Accessor<CurrentViewer | null | undefined>;

const CurrentViewerContext = createContext<CurrentViewerAccessor>(() => undefined);

/**
 * Provides the current authenticated user snapshot to app shell widgets.
 */
export function CurrentViewerProvider(props: {
    children: JSX.Element;
    viewer: CurrentViewerAccessor;
}) {
    return (
        <CurrentViewerContext.Provider value={props.viewer}>
            {props.children}
        </CurrentViewerContext.Provider>
    );
}

/**
 * Returns the current authenticated user snapshot accessor.
 */
export function useCurrentViewer(): CurrentViewerAccessor {
    return useContext(CurrentViewerContext);
}
