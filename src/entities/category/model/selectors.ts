import type { Category, CategoryBudgetSummary } from './types';

import type { Operation } from '~/entities/operation';

export function getCategoryBudgetSummary(
    category: Category,
    operations: readonly Operation[],
    monthDate: Date
): CategoryBudgetSummary {
    const spentMinor = getCategoryMonthlyExpenseMinor(category, operations, monthDate);
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

export function getCategoryMonthlyExpenseMinor(
    category: Pick<Category, 'id' | 'name'>,
    operations: readonly Operation[],
    monthDate: Date
): number {
    return operations.reduce((total, operation) => {
        const matchesCategory = operation.categoryId === category.id
            || normalizeCategoryName(operation.categoryName) === normalizeCategoryName(category.name);

        if (
            !matchesCategory
            || operation.deletedAt !== null
            || operation.type !== 'expense'
            || !isSameMonth(operation.happenedOn, monthDate)
        ) {
            return total;
        }

        return total + operation.amountInFamilyCurrencyMinor;
    }, 0);
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

function isSameMonth(isoDate: string, monthDate: Date): boolean {
    const [year, month] = isoDate.split('-').map(Number);

    return year === monthDate.getFullYear()
        && month - 1 === monthDate.getMonth();
}

function normalizeCategoryName(name: string | null): string {
    return name?.trim().toLocaleLowerCase('ru-BY') ?? '';
}

function normalizeSearchValue(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('ru-BY')
        .replace(/ё/g, 'е');
}
