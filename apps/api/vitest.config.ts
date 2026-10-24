import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		}
	},
	test: {
		// Some module exports load the shared client: tests must never open the configured on-disk database.
		env: { DATABASE_URL: ':memory:' },
		environment: 'node'
	}
});
