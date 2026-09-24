export const SELECT_ALL_TOKEN = 'all';

export function sanitizeSelection(ids: readonly string[], allIds: readonly string[]): string[] {
	const known = new Set(allIds);

	return [...new Set(ids)].filter((id) => known.has(id));
}

export function isAllSelected(selected: readonly string[], allIds: readonly string[]): boolean {
	if (allIds.length === 0) {
		return false;
	}

	const chosen = new Set(selected);

	return allIds.every((id) => chosen.has(id));
}

/**
 * «Все» toggles between «everything» and «nothing»; its checked state is
 * always derived from the selection, never stored.
 */
export function toggleAll(selected: readonly string[], allIds: readonly string[]): string[] {
	return isAllSelected(selected, allIds) ? [] : [...allIds];
}

export function toggleOne(selected: readonly string[], id: string): string[] {
	return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function encodeSelectionParam(selected: readonly string[], allIds: readonly string[]): string | undefined {
	if (selected.length === 0) {
		return undefined;
	}

	return isAllSelected(selected, allIds) ? SELECT_ALL_TOKEN : selected.join(',');
}

export function decodeSelectionParam(raw: string | undefined, allIds: readonly string[]): string[] | undefined {
	if (raw === undefined) {
		return undefined;
	}

	return raw === SELECT_ALL_TOKEN ? [...allIds] : sanitizeSelection(raw.split(','), allIds);
}
