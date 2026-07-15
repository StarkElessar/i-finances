import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    // ── Базовые пресеты (только TS/TSX — type-aware правила требуют tsconfig) ──
    ...tseslint.config({
        files: ['**/*.{ts,tsx}'],
        extends: [tseslint.configs.strictTypeChecked]
    }),

    // ── Глобальные настройки ──────────────────────
    {
        files: ['**/*.{js,ts,tsx}'],
        languageOptions: {
            globals: globals.browser
        }
    },

    // ── JS файлы ─────────────────────────────────
    {
        files: ['**/*.js'],
        plugins: { js },
        extends: ['js/recommended']
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
            'react/react-in-jsx-scope': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-unused-expressions': [
                'error',
                {
                    allowTernary: true,
                    allowShortCircuit: true
                }
            ],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports'
                }
            ],

            // Transitional: strict rules downgraded to warn (fix gradually, then upgrade to error)
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/unified-signatures': 'warn',
            '@typescript-eslint/no-invalid-void-type': 'off',
            '@typescript-eslint/no-extraneous-class': 'off',
            '@typescript-eslint/no-dynamic-delete': 'warn',
            '@typescript-eslint/no-useless-constructor': 'warn',

            // Transitional: type-aware strict rules (fix gradually, then upgrade to error)
            '@typescript-eslint/no-redundant-type-constituents': 'error',
            '@typescript-eslint/no-unnecessary-type-arguments': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/no-for-in-array': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
            '@typescript-eslint/no-deprecated': 'warn',
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

    // ── Stylistic (форматирование) ───────────────
    {
        files: ['**/*.{js,ts,tsx}'],
        plugins: { '@stylistic': stylistic },
        rules: {
            // ═══════════════════════════════════════════════
            // ОТСТУПЫ И ФОРМАТИРОВАНИЕ
            // ═══════════════════════════════════════════════

            '@stylistic/indent': [
                'error',
                4,
                {
                    SwitchCase: 1,
                    flatTernaryExpressions: false,
                    ignoredNodes: ['TemplateLiteral *']
                }
            ],

            // ═══════════════════════════════════════════════
            // КАВЫЧКИ И СТРОКИ
            // ═══════════════════════════════════════════════

            '@stylistic/quotes': [
                'error',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: 'always'
                }
            ],

            '@stylistic/jsx-quotes': ['error', 'prefer-single'],

            // ═══════════════════════════════════════════════
            // ТОЧКИ С ЗАПЯТОЙ
            // ═══════════════════════════════════════════════

            '@stylistic/semi': ['error', 'always'],

            '@stylistic/semi-spacing': [
                'error',
                {
                    before: false,
                    after: true
                }
            ],

            // ═══════════════════════════════════════════════
            // ФИГУРНЫЕ СКОБКИ — else/catch/finally С НОВОЙ СТРОКИ
            // ═══════════════════════════════════════════════

            '@stylistic/brace-style': [
                'error',
                'stroustrup',
                {
                    allowSingleLine: false
                }
            ],

            'curly': ['error', 'all'],

            // ═══════════════════════════════════════════════
            // ПРОБЕЛЫ
            // ═══════════════════════════════════════════════

            '@stylistic/space-before-blocks': ['error', 'always'],

            '@stylistic/padded-blocks': ['error', 'never'],

            '@stylistic/keyword-spacing': [
                'error',
                {
                    before: true,
                    after: true
                }
            ],

            '@stylistic/space-infix-ops': 'error',

            '@stylistic/space-in-parens': ['error', 'never'],

            '@stylistic/comma-spacing': [
                'error',
                {
                    before: false, after: true
                }
            ],

            '@stylistic/comma-dangle': ['error', 'never'],

            '@stylistic/space-before-function-paren': [
                'error',
                {
                    anonymous: 'always',
                    named: 'never',
                    asyncArrow: 'always'
                }
            ],

            '@stylistic/array-bracket-spacing': ['error', 'never'],

            '@stylistic/object-curly-spacing': ['error', 'always'],

            '@stylistic/object-curly-newline': [
                'error',
                {
                    ImportDeclaration: { multiline: true, consistent: true },
                    ExportDeclaration: { multiline: true, consistent: true },
                    ObjectExpression: { multiline: true, consistent: true },
                    ObjectPattern: { multiline: true, consistent: true }
                }
            ],

            '@stylistic/computed-property-spacing': ['error', 'never'],

            // ═══════════════════════════════════════════════
            // ПЕРЕНОСЫ СТРОК
            // ═══════════════════════════════════════════════

            '@stylistic/no-multiple-empty-lines': [
                'error',
                {
                    max: 1,
                    maxBOF: 0,
                    maxEOF: 1
                }
            ],

            '@stylistic/eol-last': ['error', 'always'],

            '@stylistic/no-trailing-spaces': 'error',

            // ═══════════════════════════════════════════════
            // ПРОЧЕЕ
            // ═══════════════════════════════════════════════

            '@stylistic/member-delimiter-style': [
                'error',
                {
                    multiline: { delimiter: 'semi', requireLast: true },
                    singleline: { delimiter: 'semi', requireLast: false }
                }
            ],

            '@stylistic/type-annotation-spacing': 'error',

            '@stylistic/arrow-parens': ['error', 'always'],

            '@stylistic/arrow-spacing': ['error', { before: true, after: true }],

            '@stylistic/no-extra-semi': 'error',

            '@stylistic/max-len': [
                'error',
                {
                    code: 140,
                    ignoreUrls: true,
                    ignoreStrings: true,
                    ignoreTemplateLiterals: true,
                    ignoreRegExpLiterals: true,
                    ignoreComments: true
                }
            ],

            '@stylistic/jsx-closing-bracket-location': ['error', 'line-aligned'],

            // Многострочный JSX оборачивается в скобки
            '@stylistic/jsx-wrap-multilines': [
                'error',
                {
                    declaration: 'parens-new-line',
                    assignment: 'parens-new-line',
                    return: 'parens-new-line',
                    arrow: 'parens-new-line',
                    condition: 'parens-new-line',
                    logical: 'parens-new-line',
                    prop: 'parens-new-line'
                }
            ],

            // Нет пробела перед /> в самозакрывающихся тегах: <Foo/> вместо <Foo />
            '@stylistic/jsx-tag-spacing': [
                'error',
                {
                    beforeSelfClosing: 'never',
                    afterOpening: 'never',
                    beforeClosing: 'never'
                }
            ],

            // Атрибуты JSX: первый атрибут на новой строке если тег мультистрочный
            '@stylistic/jsx-first-prop-new-line': ['error', 'multiline'],

            // Один атрибут на строку в мультистрочном режиме
            '@stylistic/jsx-max-props-per-line': ['error', { maximum: 1, when: 'multiline' }],

            // Нет лишних пробелов между атрибутами
            '@stylistic/no-multi-spaces': 'error',

            '@stylistic/jsx-indent-props': ['error', 4]
        }
    },

    // ── Сортировка импортов ───────────────────────
    {
        files: ['**/*.{ts,tsx}'],
        plugins: { 'simple-import-sort': simpleImportSort },
        rules: {
            'simple-import-sort/imports': [
                'error', {
                    groups: [
                        // 1. Стили (CSS/SCSS) — в самом верху (включая ?url и другие query-параметры)
                        ['^.+\\.s?css(\\?.*)?$'],

                        // 2. Side-effect imports
                        ['^\\u0000'],

                        // 3. Node.js built-ins (node:fs, node:path, ...)
                        ['^node:'],

                        // 4. React и все внешние пакеты node_modules — без разделения
                        ['^react', '^react-dom', '^@?\\w'],

                        // 5. Aliases
                        ['^@common/'],

                        // 6. @scripts по слоям FSD: shared → entities → features → widgets → views/pages
                        ['^@scripts/shared/'],
                        ['^@scripts/entities/'],
                        ['^@scripts/features/'],
                        ['^@scripts/widgets/'],
                        ['^@scripts/(views|pages)/'],
                        ['^@scripts/'],

                        // 7. Относительные импорты — ../
                        ['^\\.\\.(?!/?$)', '^\\.\\./?$'],

                        // 8. Относительные импорты — ./
                        ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$']
                    ]
                }
            ],
            'simple-import-sort/exports': 'error'
        }
    },

    // ── Declaration файлы ────────────────────────
    {
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/no-empty-object-type': 'off'
        }
    },

    // ── Общие правила ────────────────────────────
    {
        files: ['**/*.{js,ts,tsx}'],
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-inline-comments': ['error', { ignorePattern: 'eslint-disable' }],
            // Предпочитать позитивные условия (fix gradually → error)
            'no-negated-condition': 'error',
            'no-extra-boolean-cast': 'error'
        }
    }
]);