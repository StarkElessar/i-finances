import { stylelintExceptions } from './lint/literal-exceptions.js';
import { literalRules, STYLES_LAYER_GLOB, TOKENS_FILE } from './lint/stylelint-literals.js';

// Literal rules are off inside the token layer; `no-unknown-custom-properties` stays on there.
const literalRulesOffInStylesLayer = Object.fromEntries(
	Object.keys(literalRules)
		.filter((name) => name !== 'no-unknown-custom-properties')
		.map((name) => [name, null])
);

/** @type {import('stylelint').Config} */
export default {
	extends: ['@stark/stylelint-config'],
	ignoreFiles: [
		'**/node_modules/**',
		'**/dist/**',
		'**/build/**',
		'**/storybook-static/**'
	],
	// `var(--x)` is checked against the custom properties declared in the token file.
	referenceFiles: [{ files: [TOKENS_FILE], customSyntax: 'postcss-scss' }],
	rules: {
		'property-no-deprecated': [
			true,
			{
				ignoreProperties: ['-webkit-box-orient']
			}
		],
		'selector-class-pattern': [
			'^[a-z]+(?:-[a-z0-9]+)*$',
			{ resolveNestedSelectors: true }
		],
		'selector-id-pattern': [
			'^[a-z]+(?:-[a-z0-9]+)*$',
			{ resolveNestedSelectors: true }
		],
		'selector-type-no-unknown': true,
		'selector-pseudo-class-no-unknown': [
			true,
			{ ignorePseudoClasses: ['global'] }
		],
		// IF-40: no new literals. Existing violations are listed per file in lint/literal-exceptions.js.
		...literalRules
	},
	overrides: [
		{ files: [STYLES_LAYER_GLOB], rules: literalRulesOffInStylesLayer },
		// "remove in IF-N": a file leaves the list when its screen is rebuilt from tokens and the kit.
		...stylelintExceptions.map(({ rule, files }) => ({ files, rules: { [rule]: null } }))
	]
};
