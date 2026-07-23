/**
 * Produces the canonical category name stored and returned by the server.
 */
export function normalizeCategoryName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Produces a locale-aware identity used for uniqueness and matching.
 */
export function normalizeCategoryIdentity(value: string): string {
    return normalizeCategoryName(value)
        .toLocaleLowerCase('ru-BY')
        .replace(/ё/g, 'е');
}

/**
 * Produces the canonical lowercase keyword displayed in category forms.
 */
export function normalizeCategoryKeyword(value: string): string {
    return normalizeCategoryName(value).toLocaleLowerCase('ru-BY');
}
