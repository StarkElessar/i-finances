import stark, { typeChecked } from '@stark/eslint-config';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
	globalIgnores(['**/dist/**']),
	...stark,
	{
		files: ['apps/**/*.{js,ts,tsx}', 'packages/**/*.{js,ts,tsx}'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	...typeChecked,
	{
		files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@i-finances/api', '@i-finances/api/*'],
							message: 'The web app must communicate with the API over HTTP.'
						},
						{
							group: ['@i-finances/web', '@i-finances/web/*'],
							message: 'The API must not depend on the web app.'
							}
					]
				}
			],
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
	}
]);
