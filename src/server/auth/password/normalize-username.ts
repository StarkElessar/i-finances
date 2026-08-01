/**
 * Produces the canonical username used for lookup and uniqueness.
 */
export function normalizeUsername(username: string): string {
	return username.trim().toLocaleLowerCase('en-US');
}
