import {
	type CreateCategoryInput,
	createCategoryInputSchema,
	type PersistedCategory
} from '@i-finances/contracts';

export type CategoryFormFields = CreateCategoryInput;

export function readCategoryFields(formData: FormData): CategoryFormFields | undefined {
	const budgetValue = readFormString(formData, 'monthlyBudget');
	const monthlyBudgetMinor = budgetValue.length === 0
		? null
		: parseMoneyToMinorUnits(budgetValue);

	if (monthlyBudgetMinor === undefined) {
		return undefined;
	}

	const fields = {
		color: readFormString(formData, 'color'),
		description: readFormString(formData, 'description'),
		keywords: readFormString(formData, 'keywords')
			.split(/[\n,]/u)
			.map((keyword) => keyword.trim())
			.filter((keyword) => keyword.length > 0),
		monthlyBudgetMinor,
		name: readFormString(formData, 'name')
	};
	const parsedFields = createCategoryInputSchema.safeParse(fields);

	return parsedFields.success ? parsedFields.data : undefined;
}

export function toCategoryFormFields(category: PersistedCategory): CategoryFormFields {
	return {
		color: category.color,
		description: category.description,
		keywords: category.keywords,
		monthlyBudgetMinor: category.monthlyBudgetMinor,
		name: category.name
	};
}

export function formatCategoryAmount(value: number | null): string {
	return value === null ? '' : (value / 100).toFixed(2);
}

function parseMoneyToMinorUnits(value: string): number | undefined {
	const normalized = value.trim().replace(/\s/gu, '').replace(',', '.');

	if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) {
		return undefined;
	}

	const [whole, fraction = ''] = normalized.split('.');
	const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

	return Number.isSafeInteger(minorUnits) ? minorUnits : undefined;
}

function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value.trim() : '';
}
