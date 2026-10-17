/**
 * Viewport breakpoints in px for TypeScript (`matchMedia`). The single source
 * for SCSS is `$breakpoints` in `shared/styles/mixins.scss`; a test keeps the
 * two in sync. Use the names, never a bare number.
 */
export const BREAKPOINTS = {
	sm: 640,
	md: 960,
	lg: 1280
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** Same as `mx.media-mx` in SCSS: one pixel fraction under the breakpoint, so min and max queries never overlap. */
const MAX_WIDTH_OFFSET_PX = 0.02;

/** Matches the viewport from the breakpoint up; the TypeScript twin of `mx.media-mn(name)`. */
export function minWidthQuery(name: BreakpointName): string {
	return `(min-width: ${BREAKPOINTS[name] / 16}em)`;
}

/** Matches the viewport below the breakpoint; the TypeScript twin of `mx.media-mx(name)`. */
export function maxWidthQuery(name: BreakpointName): string {
	return `(max-width: ${(BREAKPOINTS[name] - MAX_WIDTH_OFFSET_PX) / 16}em)`;
}
