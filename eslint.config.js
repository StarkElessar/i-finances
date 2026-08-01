import stark, { typeChecked } from '@stark/eslint-config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	// Общие framework-neutral правила из @stark/eslint-config.
	...stark,

    // ── Базовые пресеты (только TS/TSX — type-aware правила требуют tsconfig) ──
    ...tseslint.configs.strictTypeChecked.map(({ plugins, ...config }) => ({
        ...config,
        files: ['**/*.{ts,tsx}']
    })),

    // ── Глобальные настройки ──────────────────────
    {
        files: ['**/*.{js,ts,tsx}'],
        languageOptions: {
            globals: globals.browser
        }
    },

    // ── TypeScript правила ───────────────────────
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            // TODO: включать по мере подготовки кода
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/restrict-plus-operands': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            '@typescript-eslint/no-unnecessary-type-conversion': 'off',
            '@typescript-eslint/prefer-promise-reject-errors': 'off',
            '@typescript-eslint/return-await': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-unnecessary-type-parameters': 'off'
        }
    },

    ...typeChecked,
]);
