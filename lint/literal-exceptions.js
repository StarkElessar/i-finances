// Files where a literal rule is switched off because the file already breaks it (IF-40).
// This is debt, not a permission: each entry says which task removes it ("remove in IF-N").
// A file leaves the list when its screen is rebuilt from tokens and kit components.
// Never add a new file here; fix the literal instead. The number of files per task is the
// progress metric of IF-34 and is recorded in development/decisions/lint-literals.md.
// `lint/literal-exceptions.test.ts` fails when an entry no longer has a violation.

const WEB = 'apps/web/src';

/**
 * Stylelint: rule switched off for the files.
 * @type {{ rule: string, task: string, files: string[] }[]}
 */
export const stylelintExceptions = [
	// rgb() scrims and shadows: switch to --color-scrim / --shadow-* tokens.
	{
		rule: 'function-disallowed-list',
		task: 'IF-16',
		files: [`${WEB}/views/home/home.module.scss`]
	},
	{
		rule: 'function-disallowed-list',
		task: 'IF-17',
		files: [`${WEB}/widgets/app-header/app-header.module.scss`]
	},
	{
		rule: 'function-disallowed-list',
		task: 'IF-20',
		files: [`${WEB}/shared/ui/context-menu/context-menu.module.scss`, `${WEB}/shared/ui/drag-action/drag-action.module.scss`]
	},
	{
		rule: 'function-disallowed-list',
		task: 'IF-21',
		files: [`${WEB}/shared/ui/dialog/dialog.module.scss`, `${WEB}/views/home/ui/operation-details-panel/operation-details-panel.module.scss`]
	},
	// Hex gradient stops of the drag zone.
	{
		rule: 'color-no-hex',
		task: 'IF-20',
		files: [`${WEB}/shared/ui/drag-action/drag-action.module.scss`]
	}
];

/**
 * ESLint: rule switched off for the files.
 * @type {{ rule: string, task: string, files: string[] }[]}
 */
export const eslintExceptions = [
	// Intl.NumberFormat outside shared/lib: money goes through formatCurrency / `money`.
	{
		rule: 'no-restricted-properties',
		task: 'IF-18',
		files: [`${WEB}/views/receipts/page.tsx`]
	},
	{
		rule: 'no-restricted-properties',
		task: 'IF-19',
		files: [`${WEB}/views/statistics/ui/compare-tab/compare-tab.tsx`]
	}
];
