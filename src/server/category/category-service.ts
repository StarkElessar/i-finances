import { randomUUID } from 'node:crypto';

import { createChangeCategoryArchiveStateUseCase } from './use-cases/change-category-archive-state';
import { createCreateCategoryUseCase } from './use-cases/create-category';
import { createListCategoriesUseCase } from './use-cases/list-categories';
import { createUpdateCategoryUseCase } from './use-cases/update-category';
import { createCategoryRules } from './category-rules';
import type {
	CategoryService,
	CategoryServiceDependencies
} from './category-service.types';

export type {
	CategoryService,
	CategoryServiceDependencies
} from './category-service.types';

/**
 * Creates the category application service with injectable infrastructure.
 */
export function createCategoryService(
	dependencies: CategoryServiceDependencies
): CategoryService {
	const context = {
		categoryRepository: dependencies.categoryRepository,
		createId: dependencies.createId ?? randomUUID,
		householdResolver: dependencies.householdResolver,
		now: dependencies.now ?? (() => new Date()),
		rules: createCategoryRules(
			dependencies.categoryRepository,
			dependencies.householdResolver
		)
	};

	return {
		archive: createChangeCategoryArchiveStateUseCase(context, true),
		create: createCreateCategoryUseCase(context),
		list: createListCategoriesUseCase(context),
		restore: createChangeCategoryArchiveStateUseCase(context, false),
		update: createUpdateCategoryUseCase(context)
	};
}
