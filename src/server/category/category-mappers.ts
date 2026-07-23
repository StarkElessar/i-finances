import type { CategoryAggregateRecord } from './category-repository';

import {
    normalizeCategoryIdentity,
    normalizeCategoryKeyword
} from '~/entities/category/model/normalization';
import type { PersistedCategory } from '~/entities/category/model/types';
import type { NewCategoryKeywordRecord } from '~/server/db/schema';

/**
 * Converts canonical keyword values to ordered persistence records.
 */
export function createCategoryKeywordRecords(
    categoryId: string,
    keywords: readonly string[]
): NewCategoryKeywordRecord[] {
    return keywords.map((keyword, position) => {
        const value = normalizeCategoryKeyword(keyword);

        return {
            categoryId,
            normalizedValue: normalizeCategoryIdentity(value),
            position,
            value
        };
    });
}

/**
 * Converts a category aggregate to the serializable API DTO.
 */
export function toPersistedCategory(
    record: CategoryAggregateRecord
): PersistedCategory {
    return {
        archivedAt: record.category.archivedAt?.toISOString() ?? null,
        color: record.category.color,
        createdAt: record.category.createdAt.toISOString(),
        id: record.category.id,
        keywords: record.keywords.map((keyword) => keyword.value),
        monthlyBudgetMinor: record.category.monthlyBudgetMinor,
        name: record.category.name,
        updatedAt: record.category.updatedAt.toISOString(),
        version: record.category.version
    };
}
