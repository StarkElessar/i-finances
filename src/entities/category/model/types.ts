export type Category = {
    color: string;
    createdAt: string;
    id: string;
    keywords: string[];
    monthlyBudgetMinor: number | null;
    name: string;
    updatedAt: string;
};

export type CategoryBudgetSummary = {
    hasBudget: boolean;
    isOverBudget: boolean;
    monthlyBudgetMinor: number | null;
    progressPercent: number;
    spentMinor: number;
    usagePercent: number | null;
};
