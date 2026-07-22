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
            || operation.type !== 'expense'
            || !isSameMonth(operation.happenedOn, monthDate)
        ) {
            return total;
        }

        return total + operation.amountInFamilyCurrencyMinor;
    }, 0);
}

function isSameMonth(isoDate: string, monthDate: Date): boolean {
    const [year, month] = isoDate.split('-').map(Number);

    return year === monthDate.getFullYear()
        && month - 1 === monthDate.getMonth();
}

function normalizeCategoryName(name: string | null): string {
    return name?.trim().toLocaleLowerCase('ru-BY') ?? '';
}
