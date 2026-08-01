/** @type {import('stylelint').Config} */
export default {
    extends: ['@stark/stylelint-config'],
    ignoreFiles: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**'
    ],
    rules: {
        'property-no-deprecated': [
            true, {
                'ignoreProperties': ['-webkit-box-orient']
            }
        ],
        // Разрешаем только kebab-case для локальных CSS Modules классов и id
        'selector-class-pattern': [
            '^[a-z]+(?:-[a-z0-9]+)*$',
            { resolveNestedSelectors: true }
        ],
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
        ]
    }
};
