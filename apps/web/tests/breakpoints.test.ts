import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BREAKPOINTS, maxWidthQuery, minWidthQuery } from '@/shared/lib';

import { describe, expect, it } from 'vitest';

const MIXINS_PATH = fileURLToPath(new URL('../src/shared/styles/mixins.scss', import.meta.url));

/** Reads `$breakpoints: ("sm": 640px, ...)` from the SCSS source as text. */
function readScssBreakpoints(): Record<string, number> {
	const source = readFileSync(MIXINS_PATH, 'utf8');
	const map = /\$breakpoints:\s*\(([^)]*)\)/.exec(source);

	if (map === null) {
		throw new Error('$breakpoints map was not found in mixins.scss.');
	}

	const entries = [...map[1].matchAll(/"([a-z]+)":\s*(\d+)px/g)];

	return Object.fromEntries(entries.map((entry) => [entry[1], Number(entry[2])]));
}

describe('breakpoints', () => {
	it('match the $breakpoints map in shared/styles/mixins.scss', () => {
		expect(readScssBreakpoints()).toEqual(BREAKPOINTS);
	});

	it('build min and max queries that never overlap', () => {
		expect(minWidthQuery('sm')).toBe('(min-width: 40em)');
		expect(minWidthQuery('md')).toBe('(min-width: 60em)');
		expect(maxWidthQuery('sm')).toBe('(max-width: 39.99875em)');
	});
});
