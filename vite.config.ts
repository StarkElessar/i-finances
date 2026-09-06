import { existsSync } from 'node:fs';

import { solidStart } from '@solidjs/start/config';
import { nitroV2Plugin as nitro } from '@solidjs/vite-plugin-nitro-2';
import postcssSortMediaQueries from 'postcss-sort-media-queries';
import { defineConfig } from 'vite';

// Vite only surfaces .env files through import.meta.env / its own config
// context, not reliably into process.env for Nitro API routes. Server code
// (e.g. receipt-worker-auth.ts) reads secrets straight from process.env, so
// load them explicitly here, once, for the whole dev process.
for (const envFile of ['.env', '.env.local']) {
    if (existsSync(envFile)) {
        process.loadEnvFile(envFile);
    }
}

export default defineConfig({
    css: {
        modules: {
            localsConvention: 'camelCaseOnly'
        },
        postcss: {
            plugins: [
                postcssSortMediaQueries({ sort: 'desktop-first' })
            ]
        }
    },
    plugins: [
        solidStart({
            middleware: './src/middleware.ts'
        }),
        nitro()
    ]
});
