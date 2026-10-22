const DEFAULT_INITIALS = 'ID';

const MAX_INITIALS = 2;

/**
 * Up to two capital letters for a round avatar: the first letters of the first two words, or the first two letters of
 * a single word. `ID` when the name is empty.
 */
export function getInitials(name: string | null | undefined): string {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return DEFAULT_INITIALS;
	}

	if (parts.length === 1) {
		return Array.from(parts[0] ?? DEFAULT_INITIALS).slice(0, MAX_INITIALS).join('').toUpperCase();
	}

	return parts
		.slice(0, MAX_INITIALS)
		.map((part) => Array.from(part)[0])
		.join('')
		.toUpperCase();
}
