/**
 * The tab's `sessionStorage`, or `undefined` when the browser has none or refuses it (private mode, blocked site data:
 * even reading the property can throw). Callers must work without it.
 */
export function getSessionStorage(): Storage | undefined {
	try {
		return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
	}
	catch {
		return undefined;
	}
}
