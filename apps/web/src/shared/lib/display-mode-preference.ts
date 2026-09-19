export type DisplayModePreference = 'auto' | 'table' | 'list';
export type ResolvedDisplayMode = 'table' | 'list';

function isDisplayModePreference(value: string | null): value is DisplayModePreference {
	return value === 'auto' || value === 'table' || value === 'list';
}

/**
 * Reads a stored display-mode preference, defaulting to `auto` for anything
 * missing or unrecognized (e.g. a value written by a future, incompatible
 * version). `storageKey` scopes independent preferences (operations, receipts, …)
 * to their own storage entry.
 */
export function readStoredDisplayModePreference(
	storage: Pick<Storage, 'getItem'>,
	storageKey: string
): DisplayModePreference {
	const stored = storage.getItem(storageKey);

	return isDisplayModePreference(stored) ? stored : 'auto';
}

export function writeStoredDisplayModePreference(
	storage: Pick<Storage, 'setItem'>,
	storageKey: string,
	preference: DisplayModePreference
): void {
	storage.setItem(storageKey, preference);
}

/**
 * `auto` follows the current viewport (768px breakpoint); an explicit
 * `table`/`list` choice always wins regardless of viewport width.
 */
export function resolveDisplayMode(
	preference: DisplayModePreference,
	isWideViewport: boolean
): ResolvedDisplayMode {
	if (preference === 'auto') {
		return isWideViewport ? 'table' : 'list';
	}

	return preference;
}
