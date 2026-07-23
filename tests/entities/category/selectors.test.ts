import { describe, expect, it } from 'vitest';

import type { Category } from '~/entities/category';
import {
    findSuggestedCategory,
    getCategoryBudgetSummary
} from '~/entities/category';

const timestamp = '2026-07-23T12:00:00.000Z';

function createCategory(
    id: string,
    keywords: string[]
): Category {
    return {
        color: '#3f77a8',
        createdAt: timestamp,
        id,
        keywords,
        monthlyBudgetMinor: null,
        name: id,
        updatedAt: timestamp
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
