import { useMediaQuery } from '@/shared/lib';

import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';

import {
	readStoredOperationsDisplayModePreference,
	resolveOperationsDisplayMode,
	writeStoredOperationsDisplayModePreference
} from './display-mode';
import type { OperationsDisplayModePreference, ResolvedOperationsDisplayMode } from './display-mode';

/** Matches the `768px` breakpoint token used elsewhere in `apps/web`'s SCSS. */
const WIDE_VIEWPORT_QUERY = '(min-width: 768px)';

// Module-level singleton: every caller of `useOperationsDisplayMode()` shares
// this exact signal, so writing the preference from the profile settings
// dialog is immediately visible on the operations page. See the plan's
// Task 2 note for why this must stay at module scope.
const [preference, setPreferenceSignal] = createSignal<OperationsDisplayModePreference>(
	readStoredOperationsDisplayModePreference(window.localStorage)
);

export type OperationsDisplayMode = {
	preference: Accessor<OperationsDisplayModePreference>;
	resolvedMode: Accessor<ResolvedOperationsDisplayMode>;
	setPreference: (nextPreference: OperationsDisplayModePreference) => void;
};

export function useOperationsDisplayMode(): OperationsDisplayMode {
	const isWideViewport = useMediaQuery(WIDE_VIEWPORT_QUERY);
	const resolvedMode = createMemo(() => resolveOperationsDisplayMode(preference(), isWideViewport()));

	const setPreference = (nextPreference: OperationsDisplayModePreference): void => {
		writeStoredOperationsDisplayModePreference(window.localStorage, nextPreference);
		setPreferenceSignal(nextPreference);
	};

	return { preference, resolvedMode, setPreference };
}
