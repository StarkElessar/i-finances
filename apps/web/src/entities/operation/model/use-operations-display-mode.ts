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

/**
 * Reads the stored preference, defaulting to `'auto'` if `localStorage` is
 * unavailable or throws (e.g. blocked site data raising `SecurityError`).
 */
function readInitialPreference(): OperationsDisplayModePreference {
	try {
		return readStoredOperationsDisplayModePreference(window.localStorage);
	}
	catch {
		return 'auto';
	}
}

// Module-level singleton: every caller of `useOperationsDisplayMode()` shares
// this exact signal, so writing the preference from the profile settings
// dialog is immediately visible on the operations page. See the plan's
// Task 2 note for why this must stay at module scope.
const [preference, setPreferenceSignal] = createSignal<OperationsDisplayModePreference>(
	readInitialPreference()
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
		try {
			writeStoredOperationsDisplayModePreference(window.localStorage, nextPreference);
		}
		catch {
			// Nothing actionable to do about a full/blocked localStorage for a
			// cosmetic preference — fall through to still update the in-memory
			// signal so the UI responds for the current session.
		}

		setPreferenceSignal(nextPreference);
	};

	return { preference, resolvedMode, setPreference };
}
