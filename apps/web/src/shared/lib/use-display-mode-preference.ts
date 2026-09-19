import type { Accessor, Signal } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';

import type { DisplayModePreference, ResolvedDisplayMode } from './display-mode-preference';
import {
	readStoredDisplayModePreference,
	resolveDisplayMode,
	writeStoredDisplayModePreference
} from './display-mode-preference';
import { useMediaQuery } from './use-media-query';

/** Matches the `768px` breakpoint token used elsewhere in `apps/web`'s SCSS. */
const WIDE_VIEWPORT_QUERY = '(min-width: 768px)';

/**
 * One shared signal per storage key: every caller with the same key sees the
 * same live preference (e.g. the profile dialog's toggle and the screen it
 * controls), while different keys (operations vs. receipts) stay independent.
 */
const signalByStorageKey = new Map<string, Signal<DisplayModePreference>>();

function readInitialPreference(storageKey: string): DisplayModePreference {
	try {
		return readStoredDisplayModePreference(window.localStorage, storageKey);
	}
	catch {
		return 'auto';
	}
}

function getSharedSignal(storageKey: string): Signal<DisplayModePreference> {
	const existing = signalByStorageKey.get(storageKey);

	if (existing) {
		return existing;
	}

	const created = createSignal<DisplayModePreference>(readInitialPreference(storageKey));

	signalByStorageKey.set(storageKey, created);

	return created;
}

export type DisplayModePreferenceControls = {
	preference: Accessor<DisplayModePreference>;
	resolvedMode: Accessor<ResolvedDisplayMode>;
	setPreference: (nextPreference: DisplayModePreference) => void;
};

/**
 * Reactive wrapper around a stored `auto`/`table`/`list` display preference,
 * scoped to `storageKey`. See `entities/operation`'s `useOperationsDisplayMode`
 * for the concrete, pre-bound usage.
 */
export function useDisplayModePreference(storageKey: string): DisplayModePreferenceControls {
	const isWideViewport = useMediaQuery(WIDE_VIEWPORT_QUERY);
	const [preference, setPreferenceSignal] = getSharedSignal(storageKey);
	const resolvedMode = createMemo(() => resolveDisplayMode(preference(), isWideViewport()));

	const setPreference = (nextPreference: DisplayModePreference): void => {
		try {
			writeStoredDisplayModePreference(window.localStorage, storageKey, nextPreference);
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
