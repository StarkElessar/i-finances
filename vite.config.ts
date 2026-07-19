import { solidStart } from '@solidjs/start/config';
import { nitroV2Plugin as nitro } from '@solidjs/vite-plugin-nitro-2';
import { defineConfig } from 'vite';

export default defineConfig({
    css: {
        modules: {
            localsConvention: 'camelCaseOnly'
        }
    },
    plugins: [
        solidStart({
            middleware: './src/middleware.ts'
        }),
        nitro()
    ]
});
