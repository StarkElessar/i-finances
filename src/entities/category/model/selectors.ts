import type { Category, CategoryBudgetSummary } from './types';

export function getCategoryBudgetSummary(
	category: Category,
	spentMinor: number
): CategoryBudgetSummary {
	const hasBudget = Boolean(category.monthlyBudgetMinor && category.monthlyBudgetMinor > 0);

	if (!hasBudget) {
		return {
			hasBudget: false,
			isOverBudget: false,
			monthlyBudgetMinor: category.monthlyBudgetMinor,
			progressPercent: 0,
			spentMinor,
			usagePercent: null
		};
	}

	const monthlyBudgetMinor = category.monthlyBudgetMinor as number;
	const rawPercent = (spentMinor / monthlyBudgetMinor) * 100;
	const usagePercent = Math.round(rawPercent);

	return {
		hasBudget,
		isOverBudget: spentMinor > monthlyBudgetMinor,
		monthlyBudgetMinor,
		progressPercent: Math.min(rawPercent, 100),
		spentMinor,
		usagePercent
	};
}

/**
 * Returns the first category whose normalized keyword occurs in the title.
 */
export function findSuggestedCategory(
	categories: readonly Category[],
	title: string
): Category | undefined {
	const normalizedTitle = normalizeSearchValue(title);

	if (!normalizedTitle) {
		return undefined;
	}

	return categories.find((category) => (
		category.keywords.some((keyword) => {
			const normalizedKeyword = normalizeSearchValue(keyword);

			return normalizedKeyword.length > 0
				&& normalizedTitle.includes(normalizedKeyword);
		})
	));
}

function normalizeSearchValue(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('ru-BY')
		.replace(/ё/g, 'е');
}
