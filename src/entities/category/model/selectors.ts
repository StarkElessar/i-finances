import type { Category, CategoryBudgetSummary, CategoryOperation } from './types';

export function getCategoryBudgetSummary(
    category: Category,
    operations: readonly CategoryOperation[],
    monthDate: Date
): CategoryBudgetSummary {
    const spentMinor = getCategoryMonthlyExpenseMinor(category.id, operations, monthDate);
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
    categoryId: string,
    operations: readonly CategoryOperation[],
    monthDate: Date
): number {
    return operations.reduce((total, operation) => {
        if (
            operation.categoryId !== categoryId
            || operation.type !== 'expense'
            || !isSameMonth(operation.happenedAt, monthDate)
        ) {
            return total;
        }

        return total + operation.amountInFamilyCurrencyMinor;
    }, 0);
}

function isSameMonth(isoDate: string, monthDate: Date): boolean {
    const date = new Date(isoDate);

    return date.getFullYear() === monthDate.getFullYear()
        && date.getMonth() === monthDate.getMonth();
}
