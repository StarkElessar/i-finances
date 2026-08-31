import type { Category, PersistedCategory } from '~/entities/category';
import {
	findSuggestedCategory,
	getCategoryBudgetSummary,
	sortCategoriesByMonthlySpent
} from '~/entities/category';

import { describe, expect, it } from 'vitest';

const timestamp = '2026-07-23T12:00:00.000Z';

function createCategory(
	id: string,
	keywords: string[]
): Category {
	return {
		color: '#3f77a8',
		createdAt: timestamp,
		description: '',
		icon: 'tag',
		id,
		keywords,
		monthlyBudgetMinor: null,
		name: id,
		updatedAt: timestamp
	};
}

/**
 * Builds a persisted category fixture for selector tests.
 */
function createPersistedCategory(
	id: string,
	overrides: Partial<PersistedCategory> = {}
): PersistedCategory {
	return {
		archivedAt: null,
		color: '#3f77a8',
		createdAt: timestamp,
		description: '',
		icon: 'tag',
		id,
		keywords: [],
		monthlyBudgetMinor: null,
		name: id,
		updatedAt: timestamp,
		version: 1,
		...overrides
	};
}

describe('category suggestion', () => {
	it('returns the first category with a keyword contained in the title', () => {
		const categories = [
			createCategory('Продукты', ['магазин']),
			createCategory('Досуг', ['магазин настольных игр'])
		];

		expect(findSuggestedCategory(
			categories,
			'Покупка в магазине настольных игр'
		)).toBe(categories[0]);
	});

	it('normalizes case, whitespace and е/ё', () => {
		const category = createCategory('Еда', ['Лёгкий ужин']);

		expect(findSuggestedCategory(
			[category],
			'  ЛЕГКИЙ   УЖИН с друзьями '
		)).toBe(category);
	});
});

describe('category budget summary', () => {
	it('calculates progress from the server-provided expense total', () => {
		const category = {
			...createCategory('Продукты', []),
			monthlyBudgetMinor: 45_000
		};

		expect(getCategoryBudgetSummary(
			category,
			22_500
		)).toEqual({
			hasBudget: true,
			isOverBudget: false,
			monthlyBudgetMinor: 45_000,
			progressPercent: 50,
			spentMinor: 22_500,
			usagePercent: 50
		});
	});
});

describe('category monthly spent sort', () => {
	it('sorts categories by monthly spent descending, then by name', () => {
		const unsorted = [
			createPersistedCategory('zero', { name: 'Яков' }),
			createPersistedCategory('mid', { name: 'Борис' }),
			createPersistedCategory('top', { name: 'Анна' }),
			createPersistedCategory('tie-b', { name: 'Виктор' }),
			createPersistedCategory('tie-a', { name: 'Артём' })
		];

		expect(sortCategoriesByMonthlySpent(unsorted, {
			mid: 5_000,
			'tie-a': 10_000,
			'tie-b': 10_000,
			top: 20_000
		}).map((category) => category.id)).toEqual([
			'top',
			'tie-a',
			'tie-b',
			'mid',
			'zero'
		]);
	});
});
