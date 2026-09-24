/**
 * Reads a CSS custom property from the document root; chart.js needs literal
 * colours, not `var(...)`.
 */
export function resolveThemeColor(variableName: string, fallback: string): string {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

	return value || fallback;
}
