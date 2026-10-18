// ESLint rules against literals in the web app's TypeScript and TSX (IF-40).
// Syntax-only rules on purpose: no type information, so they run fast and
// the fixture tests need no TypeScript project.
// Reasoning and the exception list: development/decisions/lint-literals.md.

/** Where the rules apply. */
export const WEB_SOURCE_GLOB = 'apps/web/**/*.{ts,tsx}';

/** Money and numbers are formatted here (formatCurrency, the future `money`), nowhere else. */
export const SHARED_LIB_GLOB = 'apps/web/src/shared/lib/**/*.{ts,tsx}';

/** Rule names, so that exceptions can switch them off one by one. */
export const INLINE_STYLE_RULE = 'no-restricted-syntax';
export const NUMBER_FORMAT_RULE = 'no-restricted-properties';

const STYLE_ATTRIBUTE = 'JSXAttribute[name.name="style"]';
const CUSTOM_PROPERTY_KEY = '[key.value=/^--/]';
const INLINE_OBJECT_PROPERTY = `${STYLE_ATTRIBUTE} > JSXExpressionContainer > ObjectExpression > Property`;
const INLINE_LITERAL_MESSAGE =
	'No colour or size literals in style={{}}. Use a CSS module class with tokens; dynamic values and CSS variables are fine.';

/** Options of `no-restricted-syntax`: literal values in an inline `style`. */
export const inlineStyleRestrictions = [
	{
		// style="color: red;"
		selector: `${STYLE_ATTRIBUTE} > Literal`,
		message: 'Inline style strings are literals. Use a CSS module class, or pass a CSS variable through style={{ \'--name\': value }}.'
	},
	{
		// style={{ color: 'red', width: 12 }}: a literal value under any key but a CSS variable.
		selector: `${INLINE_OBJECT_PROPERTY}[value.type="Literal"]:not(${CUSTOM_PROPERTY_KEY})`,
		message: INLINE_LITERAL_MESSAGE
	},
	{
		// style={{ width: `12px` }}: a template without expressions is a literal too.
		selector: `${INLINE_OBJECT_PROPERTY}[value.type="TemplateLiteral"][value.expressions.length=0]:not(${CUSTOM_PROPERTY_KEY})`,
		message: INLINE_LITERAL_MESSAGE
	}
];

/** Options of `no-restricted-properties`: `Intl.NumberFormat` as `new` or as a call. */
export const numberFormatRestrictions = [
	{
		object: 'Intl',
		property: 'NumberFormat',
		message: 'Do not build Intl.NumberFormat in the UI. Money goes through formatCurrency (shared/lib), numbers through a helper in shared/lib.'
	}
];

/**
 * Flat config blocks for eslint.config.js.
 * @param {{ rule: string, files: string[] }[]} exceptions files where a rule is off until its task lands ("remove in IF-N")
 */
export function createLiteralConfigs(exceptions = []) {
	return [
		{
			files: [WEB_SOURCE_GLOB],
			ignores: [SHARED_LIB_GLOB],
			rules: {
				[INLINE_STYLE_RULE]: ['error', ...inlineStyleRestrictions],
				[NUMBER_FORMAT_RULE]: ['error', ...numberFormatRestrictions]
			}
		},
		...exceptions.map(({ rule, files }) => ({ files, rules: { [rule]: 'off' } }))
	];
}
