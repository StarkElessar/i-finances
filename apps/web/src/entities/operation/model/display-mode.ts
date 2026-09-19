import type { DisplayModePreference, ResolvedDisplayMode } from '@/shared/lib';
import {
	readStoredDisplayModePreference,
	resolveDisplayMode,
	writeStoredDisplayModePreference
} from '@/shared/lib';

/**
 * localStorage key for the user's manual operations-view preference.
 * Shared between the operations screen (reads the resolved mode) and the
 * profile settings popup (writes the preference) — see
 * `use-operations-display-mode.ts` for the reactive wrapper around this.
 */
export const OPERATIONS_DISPLAY_MODE_STORAGE_KEY = 'i-finances:operations-display-mode';

export type OperationsDisplayModePreference = DisplayModePreference;
export type ResolvedOperationsDisplayMode = ResolvedDisplayMode;

/**
 * Reads the stored preference, defaulting to `auto` for anything missing or
 * unrecognized (e.g. a value written by a future, incompatible version).
 */
export function readStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'getItem'>
): OperationsDisplayModePreference {
	return readStoredDisplayModePreference(storage, OPERATIONS_DISPLAY_MODE_STORAGE_KEY);
}

export function writeStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'setItem'>,
	preference: OperationsDisplayModePreference
): void {
	writeStoredDisplayModePreference(storage, OPERATIONS_DISPLAY_MODE_STORAGE_KEY, preference);
}

/**
 * `auto` follows the current viewport (768px breakpoint); an explicit
 * `table`/`list` choice always wins regardless of viewport width.
 */
export const resolveOperationsDisplayMode = resolveDisplayMode;
