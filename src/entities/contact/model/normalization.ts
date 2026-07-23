/**
 * Produces the canonical contact name stored and returned by the server.
 */
export function normalizeContactName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Produces a locale-aware identity used for uniqueness and search.
 */
export function normalizeContactIdentity(value: string): string {
    return normalizeContactName(value)
        .toLocaleLowerCase('ru-BY')
        .replace(/ё/g, 'е');
}

/**
 * Produces a canonical optional legal name.
 */
export function normalizeContactLegalName(
    value: string | null
): string | null {
    if (value === null) {
        return null;
    }

    return normalizeContactName(value) || null;
}
