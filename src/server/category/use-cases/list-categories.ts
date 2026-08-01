import { toPersistedCategory } from '../category-mappers';
import type { CategoryService } from '../category-service.types';
import type { CategoryUseCaseContext } from '../category-use-case.types';

/**
 * Creates the query that lists categories belonging to the active household.
 */
export function createListCategoriesUseCase(
	context: Pick<
		CategoryUseCaseContext,
		'categoryRepository' | 'householdResolver'
	>
): CategoryService['list'] {
	return async (userId, status) => {
		const household = await context.householdResolver.requireForUser(userId);
		const records = await context.categoryRepository.list(
			household.id,
			status
		);

		return {
			baseCurrency: household.baseCurrency,
			items: records.map(toPersistedCategory)
		};
	};
}
