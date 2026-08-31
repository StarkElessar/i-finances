import {
	normalizeCategoryIdentity,
	normalizeCategoryName
} from '~/entities/category/model/normalization';

import { CategoryVersionConflictError } from '../category-errors';
import {
	createCategoryKeywordRecords,
	toPersistedCategory
} from '../category-mappers';
import type { CategoryService } from '../category-service.types';
import type { CategoryUseCaseContext } from '../category-use-case.types';

/**
 * Creates the command that updates a category using optimistic locking.
 */
export function createUpdateCategoryUseCase(
	context: Pick<
		CategoryUseCaseContext,
		'categoryRepository' | 'now' | 'rules'
	>
): CategoryService['update'] {
	return async (userId, input) => {
		const current = await context.rules.requireCurrent(userId, input.id);
		const name = normalizeCategoryName(input.name);

		context.rules.assertVersion(current.record, input.version);
		await context.rules.assertNameAvailable(
			current.householdId,
			name,
			input.id
		);

		const record = await context.categoryRepository.update(
			current.householdId,
			input.id,
			input.version,
			{
				color: input.color,
				description: input.description,
				icon: input.icon,
				monthlyBudgetMinor: input.monthlyBudgetMinor,
				name,
				normalizedName: normalizeCategoryIdentity(name),
				updatedAt: context.now()
			},
			createCategoryKeywordRecords(input.id, input.keywords)
		);

		if (record === undefined) {
			throw new CategoryVersionConflictError();
		}

		return toPersistedCategory(record);
	};
}
