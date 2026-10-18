// Fixture tests for the IF-40 literal rules: each rule catches a violation, and the
// exception lists in lint/literal-exceptions.js contain no stale entries.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import stylelint from 'stylelint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { createLiteralConfigs } from '../../../lint/eslint-literals.js';
import { eslintExceptions, stylelintExceptions } from '../../../lint/literal-exceptions.js';
import { literalRules, TOKENS_FILE } from '../../../lint/stylelint-literals.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCREEN_FILE = 'apps/web/src/views/fixture/fixture.module.scss';
const STYLES_LAYER_FILE = 'apps/web/src/shared/styles/fixture.scss';

async function lintScss(code, codeFilename = SCREEN_FILE) {
	const result = await stylelint.lint({ code, codeFilename: `${ROOT}${codeFilename}`, configFile: `${ROOT}stylelint.config.js` });
	return result.results[0].warnings.map((warning) => warning.rule);
}

describe('stylelint literal rules', () => {
	it.each([
		['hex colour', 'a { color: #fff; }', 'color-no-hex'],
		['hex inside color-mix', 'a { color: color-mix(in srgb, var(--color-primary), #000 6%); }', 'color-no-hex'],
		['rgb()', 'a { background: rgb(23 32 51 / 40%); }', 'function-disallowed-list'],
		['rgba()', 'a { background: rgba(0, 0, 0, 0.4); }', 'function-disallowed-list'],
		['hsl()', 'a { color: hsl(210 50% 40%); }', 'function-disallowed-list'],
		['numeric z-index', 'a { z-index: 10; }', 'declaration-property-value-allowed-list'],
		['calc z-index', 'a { z-index: calc(var(--z-modal) + 1); }', 'declaration-property-value-allowed-list'],
		['raw min-width media', '@media (min-width: 640px) { a { color: red; } }', 'media-feature-name-disallowed-list'],
		['raw range media', '@media (width >= 640px) { a { color: red; } }', 'media-feature-name-disallowed-list'],
		['raw max-width media', '@media (max-width: 599px) { a { color: red; } }', 'media-feature-name-disallowed-list'],
		['unknown custom property', 'a { color: var(--color-does-not-exist); }', 'no-unknown-custom-properties'],
		['!important', 'a { color: red !important; }', 'declaration-no-important']
	])('rejects %s', async (_name, code, rule) => {
		expect(await lintScss(code)).toContain(rule);
	});

	it.each([
		['token colour', 'a { color: var(--color-text-primary); }'],
		['color-mix over tokens', 'a { color: color-mix(in srgb, var(--color-danger) 18%, transparent); }'],
		['layer token z-index', 'a { z-index: var(--z-modal); }'],
		['neutral z-index', 'a { z-index: auto; } b { z-index: 0; } c { z-index: -1; }'],
		['reduced motion media', '@media (prefers-reduced-motion: reduce) { a { animation: none; } }'],
		['a custom property declared in the same file', 'a { --local: 1px; padding: var(--local); }'],
		['a custom property with a fallback', 'a { color: var(--set-inline, red); }']
	])('accepts %s', async (_name, code) => {
		const rules = await lintScss(code);
		const literalRuleNames = [...Object.keys(literalRules), 'declaration-no-important'];
		expect(rules.filter((rule) => literalRuleNames.includes(rule))).toEqual([]);
	});

	it('accepts literals inside the token layer', async () => {
		const rules = await lintScss(':root { --x: #fff; --y: rgb(0 0 0 / 10%); z-index: 10; }', STYLES_LAYER_FILE);
		expect(rules.filter((rule) => rule !== 'no-unknown-custom-properties' && literalRulesOnly(rule))).toEqual([]);
	});

	it('has no stale exceptions: every listed file still breaks its rule', async () => {
		for (const { rule, task, files } of stylelintExceptions) {
			for (const file of files) {
				const result = await stylelint.lint({
					code: readFileSync(`${ROOT}${file}`, 'utf8'),
					codeFilename: `${ROOT}${file}`,
					config: {
						customSyntax: 'postcss-scss',
						referenceFiles: [{ files: [`${ROOT}${TOKENS_FILE}`], customSyntax: 'postcss-scss' }],
						rules: { [rule]: literalRules[rule] }
					}
				});
				const hits = result.results[0].warnings.filter((warning) => warning.rule === rule);
				expect(hits.length, `${file} no longer breaks ${rule}: remove it from the ${task} exceptions`).toBeGreaterThan(0);
			}
		}
	});
});

function literalRulesOnly(rule) {
	return Object.keys(literalRules).includes(rule);
}

const eslintLinter = new Linter({ cwd: ROOT });

function lintTsx(code, filename = 'apps/web/src/views/fixture/fixture.tsx') {
	const messages = eslintLinter.verify(
		code,
		[
			{
				files: ['**/*.{ts,tsx}'],
				languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } }
			},
			...createLiteralConfigs()
		],
		{ filename }
	);
	return messages.map((message) => message.ruleId);
}

describe('eslint literal rules', () => {
	it.each([
		['colour literal in style', 'const a = <i style={{ color: \'red\' }}/>;', 'no-restricted-syntax'],
		['size literal in style', 'const a = <i style={{ width: 12 }}/>;', 'no-restricted-syntax'],
		['template literal without expressions', 'const a = <i style={{ \'min-width\': `12px` }}/>;', 'no-restricted-syntax'],
		['literal next to a dynamic value', 'const a = <i style={{ width: `${w}px`, color: \'#fff\' }}/>;', 'no-restricted-syntax'],
		['style string', 'const a = <i style="color: red"/>;', 'no-restricted-syntax'],
		['new Intl.NumberFormat', 'const f = new Intl.NumberFormat(\'ru-RU\');', 'no-restricted-properties'],
		['Intl.NumberFormat call', 'const f = Intl.NumberFormat(\'ru-RU\');', 'no-restricted-properties']
	])('rejects %s', (_name, code, rule) => {
		expect(lintTsx(code)).toContain(rule);
	});

	it.each([
		['dynamic value', 'const a = <i style={{ width: `${w}px`, \'background-color\': props.color }}/>;'],
		['CSS variable with a literal', 'const a = <i style={{ \'--category-color\': \'red\' }}/>;'],
		['style from a function', 'const a = <i style={getStyle(x)}/>;'],
		['Intl.DateTimeFormat', 'const f = new Intl.DateTimeFormat(\'ru-RU\');'],
		['Intl types', 'type O = Intl.NumberFormatOptions;']
	])('accepts %s', (_name, code) => {
		expect(lintTsx(code)).toEqual([]);
	});

	it('allows Intl.NumberFormat inside shared/lib', () => {
		expect(lintTsx('const f = new Intl.NumberFormat(\'ru-RU\');', 'apps/web/src/shared/lib/money.ts')).toEqual([]);
	});

	it('has no stale exceptions: every listed file still breaks its rule', () => {
		for (const { rule, task, files } of eslintExceptions) {
			for (const file of files) {
				const hits = lintTsx(readFileSync(`${ROOT}${file}`, 'utf8'), file).filter((id) => id === rule);
				expect(hits.length, `${file} no longer breaks ${rule}: remove it from the ${task} exceptions`).toBeGreaterThan(0);
			}
		}
	});
});
