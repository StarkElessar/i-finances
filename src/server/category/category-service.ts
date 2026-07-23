import { randomUUID } from 'node:crypto';

import type {
    CategoryAggregateRecord,
    CategoryRepository
} from './category-repository';

import type {
    CategoryListStatus,
    ChangeCategoryArchiveStateInput,
    CreateCategoryInput,
    UpdateCategoryInput
} from '~/entities/category/api/category.contract';
import {
    normalizeCategoryIdentity,
    normalizeCategoryKeyword,
    normalizeCategoryName
} from '~/entities/category/model/normalization';
import type {
    CategoryCollection,
    PersistedCategory
} from '~/entities/category/model/types';
import type { NewCategoryKeywordRecord } from '~/server/db/schema';
import type { HouseholdResolver } from '~/server/household/household-service';

/**
 * Signals that the requested category is not part of the active household.
 */
export class CategoryNotFoundError extends Error {
    constructor() {
        super('Category not found.');
        this.name = 'CategoryNotFoundError';
    }
}

/**
 * Signals that a category changed after the client loaded it.
 */
export class CategoryVersionConflictError extends Error {
    constructor() {
        super('Category version conflict.');
        this.name = 'CategoryVersionConflictError';
    }
}

/**
 * Signals that another category in the household owns the normalized name.
 */
export class CategoryNameConflictError extends Error {
    constructor() {
        super('Category name already exists.');
        this.name = 'CategoryNameConflictError';
    }
}

export type CategoryServiceDependencies = {
    categoryRepository: CategoryRepository;
    householdResolver: HouseholdResolver;
    createId?: () => string;
    now?: () => Date;
};

export type CategoryService = {
    archive: (
        userId: string,
        input: ChangeCategoryArchiveStateInput
    ) => Promise<PersistedCategory>;
    create: (
        userId: string,
        input: CreateCategoryInput
    ) => Promise<PersistedCategory>;
    list: (
        userId: string,
        status: CategoryListStatus
    ) => Promise<CategoryCollection>;
    restore: (
        userId: string,
        input: ChangeCategoryArchiveStateInput
    ) => Promise<PersistedCategory>;
    update: (
        userId: string,
        input: UpdateCategoryInput
    ) => Promise<PersistedCategory>;
};

/**
 * Creates the category application service with injectable infrastructure.
 */
export function createCategoryService(
    dependencies: CategoryServiceDependencies
): CategoryService {
    const createId = dependencies.createId ?? randomUUID;
    const now = dependencies.now ?? (() => new Date());

    const requireCurrentCategory = async (
        userId: string,
        categoryId: string
    ): Promise<{ householdId: string; record: CategoryAggregateRecord }> => {
        const household = await dependencies.householdResolver.requireForUser(userId);
        const record = await dependencies.categoryRepository.findById(
            household.id,
            categoryId
        );

        if (record !== undefined) {
            return {
                householdId: household.id,
                record
            };
        }

        throw new CategoryNotFoundError();
    };

    const assertVersion = (
        record: CategoryAggregateRecord,
        expectedVersion: number
    ): void => {
        if (record.category.version === expectedVersion) {
            return;
        }

        throw new CategoryVersionConflictError();
    };

    const assertNameAvailable = async (
        householdId: string,
        name: string,
        currentCategoryId?: string
    ): Promise<void> => {
        const existingCategoryId = await dependencies.categoryRepository
            .findIdByNormalizedName(
                householdId,
                normalizeCategoryIdentity(name)
            );

        if (
            existingCategoryId !== undefined
            && existingCategoryId !== currentCategoryId
        ) {
            throw new CategoryNameConflictError();
        }
    };

    const list = async (
        userId: string,
        status: CategoryListStatus
    ): Promise<CategoryCollection> => {
        const household = await dependencies.householdResolver.requireForUser(userId);
        const records = await dependencies.categoryRepository.list(
            household.id,
            status
        );

        return {
            baseCurrency: household.baseCurrency,
            items: records.map(toPersistedCategory)
        };
    };

    const create = async (
        userId: string,
        input: CreateCategoryInput
    ): Promise<PersistedCategory> => {
        const household = await dependencies.householdResolver.requireForUser(userId);
        const categoryId = createId();
        const timestamp = now();
        const name = normalizeCategoryName(input.name);

        await assertNameAvailable(household.id, name);

        const record = await dependencies.categoryRepository.insert(
            {
                archivedAt: null,
                color: input.color,
                createdAt: timestamp,
                createdByUserId: userId,
                householdId: household.id,
                id: categoryId,
                monthlyBudgetMinor: input.monthlyBudgetMinor,
                name,
                normalizedName: normalizeCategoryIdentity(name),
                updatedAt: timestamp,
                version: 1
            },
            createKeywordRecords(categoryId, input.keywords)
        );

        if (record !== undefined) {
            return toPersistedCategory(record);
        }

        throw new CategoryNameConflictError();
    };

    const update = async (
        userId: string,
        input: UpdateCategoryInput
    ): Promise<PersistedCategory> => {
        const current = await requireCurrentCategory(userId, input.id);
        const name = normalizeCategoryName(input.name);

        assertVersion(current.record, input.version);
        await assertNameAvailable(current.householdId, name, input.id);

        const updatedRecord = await dependencies.categoryRepository.update(
            current.householdId,
            input.id,
            input.version,
            {
                color: input.color,
                monthlyBudgetMinor: input.monthlyBudgetMinor,
                name,
                normalizedName: normalizeCategoryIdentity(name),
                updatedAt: now()
            },
            createKeywordRecords(input.id, input.keywords)
        );

        if (updatedRecord !== undefined) {
            return toPersistedCategory(updatedRecord);
        }

        throw new CategoryVersionConflictError();
    };

    const changeArchiveState = async (
        userId: string,
        input: ChangeCategoryArchiveStateInput,
        archived: boolean
    ): Promise<PersistedCategory> => {
        const current = await requireCurrentCategory(userId, input.id);

        assertVersion(current.record, input.version);

        const alreadyInTargetState = archived
            ? current.record.category.archivedAt !== null
            : current.record.category.archivedAt === null;

        if (alreadyInTargetState) {
            return toPersistedCategory(current.record);
        }

        const timestamp = now();
        const updatedRecord = await dependencies.categoryRepository.setArchivedAt(
            current.householdId,
            input.id,
            input.version,
            archived ? timestamp : null,
            timestamp
        );

        if (updatedRecord !== undefined) {
            return toPersistedCategory(updatedRecord);
        }

        throw new CategoryVersionConflictError();
    };

    const archive = (
        userId: string,
        input: ChangeCategoryArchiveStateInput
    ): Promise<PersistedCategory> => changeArchiveState(userId, input, true);

    const restore = (
        userId: string,
        input: ChangeCategoryArchiveStateInput
    ): Promise<PersistedCategory> => changeArchiveState(userId, input, false);

    return {
        archive,
        create,
        list,
        restore,
        update
    };
}

function createKeywordRecords(
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

function toPersistedCategory(
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
