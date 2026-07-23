import type { CategoryRepository } from './category-repository';

import type {
    CategoryListStatus,
    ChangeCategoryArchiveStateInput,
    CreateCategoryInput,
    UpdateCategoryInput
} from '~/entities/category/api/category.contract';
import type {
    CategoryCollection,
    PersistedCategory
} from '~/entities/category/model/types';
import type { HouseholdResolver } from '~/server/household/household-service';

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
