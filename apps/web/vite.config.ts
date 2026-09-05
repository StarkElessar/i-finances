import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
	css: {
		modules: {
			localsConvention: 'camelCaseOnly'
		}
	},
	plugins: [solid()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		}
	},
	server: {
		proxy: {
			'/api': 'http://localhost:3001'
		}
	}
});
