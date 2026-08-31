import type { CurrencyCodeValue } from '~/shared/lib';

import type { CategoryIconId } from './icons';

export type Category = {
	color: string;
	createdAt: string;
	description: string;
	icon: CategoryIconId;
	id: string;
	keywords: string[];
	monthlyBudgetMinor: number | null;
	name: string;
	updatedAt: string;
};

/**
 * Canonical category DTO returned by the server persistence layer.
 */
export type PersistedCategory = Category & {
	archivedAt: string | null;
	version: number;
};

export type CategoryCollection = {
	baseCurrency: CurrencyCodeValue;
	items: PersistedCategory[];
};

export type CategoryBudgetSummary = {
	hasBudget: boolean;
	isOverBudget: boolean;
	monthlyBudgetMinor: number | null;
	progressPercent: number;
	spentMinor: number;
	usagePercent: number | null;
};
