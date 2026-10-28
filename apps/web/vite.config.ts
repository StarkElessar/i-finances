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
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			// Font files for url() in shared/styles/fonts.scss: Vite does not resolve a bare package name there.
			'@ibm-plex-sans': fileURLToPath(new URL('./node_modules/@fontsource/ibm-plex-sans/files', import.meta.url))
		}
	},
	server: {
		proxy: {
			'/api': 'http://localhost:3001'
		}
	}
});
