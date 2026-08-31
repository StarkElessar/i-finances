import {
	normalizeCategoryIdentity,
	normalizeCategoryName
} from '~/entities/category/model/normalization';

import { CategoryNameConflictError } from '../category-errors';
import {
	createCategoryKeywordRecords,
	toPersistedCategory
} from '../category-mappers';
import type { CategoryService } from '../category-service.types';
import type { CategoryUseCaseContext } from '../category-use-case.types';

/**
 * Creates the command that persists a category in the active household.
 */
export function createCreateCategoryUseCase(
	context: CategoryUseCaseContext
): CategoryService['create'] {
	return async (userId, input) => {
		const household = await context.householdResolver.requireForUser(userId);
		const categoryId = context.createId();
		const timestamp = context.now();
		const name = normalizeCategoryName(input.name);

		await context.rules.assertNameAvailable(household.id, name);

		const record = await context.categoryRepository.insert(
			{
				archivedAt: null,
				color: input.color,
				createdAt: timestamp,
				createdByUserId: userId,
				description: input.description,
				householdId: household.id,
				icon: input.icon,
				id: categoryId,
				monthlyBudgetMinor: input.monthlyBudgetMinor,
				name,
				normalizedName: normalizeCategoryIdentity(name),
				updatedAt: timestamp,
				version: 1
			},
			createCategoryKeywordRecords(categoryId, input.keywords)
		);

		if (record === undefined) {
			throw new CategoryNameConflictError();
		}

		return toPersistedCategory(record);
	};
}
