/** @type {import('stylelint').Config} */
export default {
    extends: [
        'stylelint-config-standard-scss',
        'stylelint-config-clean-order',
        '@stylistic/stylelint-config'
    ],
    ignoreFiles: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**'
    ],
    overrides: [
        {
            files: ['**/*.scss'],
            customSyntax: 'postcss-scss'
        }
    ],
    plugins: ['stylelint-scss', 'stylelint-use-logical'],
    rules: {
        '@stylistic/string-quotes': 'double',
        '@stylistic/indentation': 4,
        '@stylistic/max-line-length': 140,
        'property-no-deprecated': [
            true, {
                'ignoreProperties': ['-webkit-box-orient']
            }
        ],
        // Разрешаем только kebab-case id
        'selector-id-pattern': [
            '^[a-z]+(?:-[a-z0-9]+)*$',
            { resolveNestedSelectors: true }
        ],
        'selector-type-no-unknown': true,
        'selector-pseudo-class-no-unknown': [
            true,
            {
                ignorePseudoClasses: ['global']
            }
        ],
        'csstools/use-logical': true,
        'declaration-no-important': true
    }
};