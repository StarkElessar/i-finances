import type {
	Category,
	CategoryBudgetSummary,
	PersistedCategory
} from './types';

const CATEGORY_COLLATOR = new Intl.Collator('ru-BY', {
	numeric: true,
	sensitivity: 'base'
});

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

/**
 * Sorts categories by monthly spent amount descending; ties break by name.
 */
export function sortCategoriesByMonthlySpent(
	categories: readonly PersistedCategory[],
	spentMinorById: Readonly<Record<string, number>>
): PersistedCategory[] {
	return categories.toSorted((left, right) => {
		const spentDelta = (
			(spentMinorById[right.id] ?? 0) - (spentMinorById[left.id] ?? 0)
		);

		if (spentDelta !== 0) {
			return spentDelta;
		}

		return CATEGORY_COLLATOR.compare(left.name, right.name);
	});
}

function normalizeSearchValue(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('ru-BY')
		.replace(/ё/g, 'е');
}
