import type { CurrencyCodeValue } from '~/shared/lib';

export type Category = {
    color: string;
    createdAt: string;
    id: string;
    keywords: string[];
    monthlyBudgetMinor: number | null;
    name: string;
    updatedAt: string;
};

export type CategoryOperationType = 'expense' | 'income';

export type CategoryOperation = {
    amountInFamilyCurrencyMinor: number;
    amountMinor: number;
    categoryId: string;
    currency: CurrencyCodeValue;
    familyCurrency: CurrencyCodeValue;
    happenedAt: string;
    id: string;
    title: string;
    type: CategoryOperationType;
};

export type CategoryBudgetSummary = {
    hasBudget: boolean;
    isOverBudget: boolean;
    monthlyBudgetMinor: number | null;
    progressPercent: number;
    spentMinor: number;
    usagePercent: number | null;
};
