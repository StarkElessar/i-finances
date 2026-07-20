import { solidStart } from '@solidjs/start/config';
import { nitroV2Plugin as nitro } from '@solidjs/vite-plugin-nitro-2';
import postcssSortMediaQueries from 'postcss-sort-media-queries';
import { defineConfig } from 'vite';

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
