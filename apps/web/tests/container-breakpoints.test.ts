import { fileURLToPath } from 'node:url';

import { compileString } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

const STYLES_DIR = fileURLToPath(new URL('../src/shared/styles/', import.meta.url));

/** Compiles a snippet that uses `shared/styles/mixins.scss` as `mx`. */
function compile(body: string): string {
	return compileString(`@use "mixins" as mx;\n${body}`, { loadPaths: [STYLES_DIR] }).css;
}

describe('mx.container-mn', () => {
	it('emits a min-width container query in rem for a named container breakpoint', () => {
		const css = compile('.a { @include mx.container-mn(columns-4) { color: red; } }');

		expect(css).toContain('@container (min-width: 37.5rem)');
		expect(css).toContain('color: red');
	});

	it('maps every container breakpoint name to the Layout-Spec width', () => {
		const widths = { 'columns-4': '37.5rem', 'columns-5': '53.75rem', 'columns-7': '68.75rem', 'sort-label': '43.75rem' };

		for (const [name, rem] of Object.entries(widths)) {
			expect(compile(`.a { @include mx.container-mn(${name}) { color: red; } }`)).toContain(`(min-width: ${rem})`);
		}
	});

	it('rejects a number and an unknown name', () => {
		expect(() => compile('.a { @include mx.container-mn(600px) { color: red; } }')).toThrow(/must be a name/);
		expect(() => compile('.a { @include mx.container-mn(huge) { color: red; } }')).toThrow(/Unknown container breakpoint/);
	});
});
