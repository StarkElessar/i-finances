import type { Category } from './types';

export const CATEGORY_STORAGE_KEY = 'i-finances.categories.v1';
const KEYWORD_MAX_LENGTH = 32;

export function readCategoriesFromStorage(storage: Storage): Category[] | undefined {
    const rawValue = storage.getItem(CATEGORY_STORAGE_KEY);

    if (!rawValue) {
        return undefined;
    }

    try {
        const parsedValue: unknown = JSON.parse(rawValue);

        if (!Array.isArray(parsedValue)) {
            return undefined;
        }

        const categories = parsedValue
            .map(normalizeStoredCategory)
            .filter((category): category is Category => Boolean(category));

        return categories.length > 0 ? categories : undefined;
    }
    catch {
        return undefined;
    }
}

export function writeCategoriesToStorage(storage: Storage, categories: readonly Category[]): void {
    storage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
}

function normalizeStoredCategory(value: unknown): Category | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = normalizeRequiredString(value.id);
    const name = normalizeRequiredString(value.name);
    const color = normalizeColor(value.color);
    const monthlyBudgetMinor = normalizeBudget(value.monthlyBudgetMinor);
    const createdAt = normalizeDate(value.createdAt);
    const updatedAt = normalizeDate(value.updatedAt);

    if (!id || !name || !color || monthlyBudgetMinor === undefined || !createdAt || !updatedAt) {
        return undefined;
    }

    return {
        color,
        createdAt,
        id,
        keywords: normalizeKeywords(value.keywords),
        monthlyBudgetMinor,
        name,
        updatedAt
    };
}

function normalizeRequiredString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalizedValue = value.trim();

    return normalizedValue || undefined;
}

function normalizeColor(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return /^#[\da-f]{6}$/i.test(value) ? value : undefined;
}

function normalizeBudget(value: unknown): number | null | undefined {
    if (value === null) {
        return null;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return undefined;
    }

    return value;
}

function normalizeDate(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

function normalizeKeywords(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const keywords: string[] = [];

    value.forEach((item) => {
        if (typeof item !== 'string') {
            return;
        }

        const keyword = item.trim().replace(/\s+/g, ' ').toLowerCase();

        if (!keyword || keyword.length > KEYWORD_MAX_LENGTH || keywords.includes(keyword)) {
            return;
        }

        keywords.push(keyword);
    });

    return keywords;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
