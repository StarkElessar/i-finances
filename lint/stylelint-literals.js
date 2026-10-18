// Stylelint rules against literals in component styles (IF-40).
// Tokens, breakpoints and layers are defined once in `apps/web/src/shared/styles`;
// everything outside of it consumes them and never repeats the values.
// Reasoning and the exception list: development/decisions/lint-literals.md.

/** The token file is the source of truth for `var(--x)` references. */
export const TOKENS_FILE = 'apps/web/src/shared/styles/tokens.scss';

/** The token layer itself is where the values live: the literal rules are off there. */
export const STYLES_LAYER_GLOB = 'apps/web/src/shared/styles/**/*.scss';

/** Stylelint rule name -> primary option (and secondary options). */
export const literalRules = {
	// #fff, #1b2333 and any hex inside color-mix(), gradients or shadows.
	'color-no-hex': [true, { message: 'Use a colour token from shared/styles/tokens.scss, not a hex literal.' }],
	// rgb()/hsl() and friends with literal channels. color-mix() over tokens, `transparent`
	// and `currentcolor` stays legal; a literal inside it is caught by color-no-hex or by this list.
	'function-disallowed-list': [
		['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'],
		{ message: 'Use a colour token from shared/styles/tokens.scss, not a colour function with literal channels.' }
	],
	// Only the layer scale (var(--z-*)) and the three neutral values.
	'declaration-property-value-allowed-list': [
		{ 'z-index': ['/^var\\(--z-[a-z-]+\\)$/', 'auto', '0', '-1'] },
		{ message: 'z-index takes var(--z-*) from the layer scale, or auto, 0 and -1.' }
	],
	// Raw size queries. Breakpoints go through `@include mx.media-mn(sm|md|lg)`.
	// User-preference queries (prefers-reduced-motion, hover, pointer, ...) stay legal.
	'media-feature-name-disallowed-list': [
		[
			'width', 'min-width', 'max-width',
			'height', 'min-height', 'max-height',
			'aspect-ratio', 'min-aspect-ratio', 'max-aspect-ratio',
			'device-width', 'min-device-width', 'max-device-width',
			'device-height', 'min-device-height', 'max-device-height',
			'resolution', 'min-resolution', 'max-resolution'
		],
		{ message: 'No raw size media queries: use @include mx.media-mn(sm|md|lg) from shared/styles/mixins.' }
	],
	// var(--x) must point at a custom property declared in the token file or in the same file.
	'no-unknown-custom-properties': true
};
