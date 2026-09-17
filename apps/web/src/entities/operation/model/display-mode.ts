/**
 * localStorage key for the user's manual operations-view preference.
 * Shared between the operations screen (reads the resolved mode) and the
 * profile settings popup (writes the preference) — see
 * `use-operations-display-mode.ts` for the reactive wrapper around this.
 */
export const OPERATIONS_DISPLAY_MODE_STORAGE_KEY = 'i-finances:operations-display-mode';

export type OperationsDisplayModePreference = 'auto' | 'table' | 'list';
export type ResolvedOperationsDisplayMode = 'table' | 'list';

function isOperationsDisplayModePreference(value: string | null): value is OperationsDisplayModePreference {
	return value === 'auto' || value === 'table' || value === 'list';
}

/**
 * Reads the stored preference, defaulting to `auto` for anything missing or
 * unrecognized (e.g. a value written by a future, incompatible version).
 */
export function readStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'getItem'>
): OperationsDisplayModePreference {
	const stored = storage.getItem(OPERATIONS_DISPLAY_MODE_STORAGE_KEY);

	return isOperationsDisplayModePreference(stored) ? stored : 'auto';
}

export function writeStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'setItem'>,
	preference: OperationsDisplayModePreference
): void {
	storage.setItem(OPERATIONS_DISPLAY_MODE_STORAGE_KEY, preference);
}

/**
 * `auto` follows the current viewport (768px breakpoint); an explicit
 * `table`/`list` choice always wins regardless of viewport width.
 */
export function resolveOperationsDisplayMode(
	preference: OperationsDisplayModePreference,
	isWideViewport: boolean
): ResolvedOperationsDisplayMode {
	if (preference === 'auto') {
		return isWideViewport ? 'table' : 'list';
	}

	return preference;
}
