import { CategoryVersionConflictError } from '../category-errors';
import { toPersistedCategory } from '../category-mappers';
import type { CategoryService } from '../category-service.types';
import type { CategoryUseCaseContext } from '../category-use-case.types';

/**
 * Creates an archive-state command shared by archive and restore operations.
 */
export function createChangeCategoryArchiveStateUseCase(
	context: Pick<
		CategoryUseCaseContext,
		'categoryRepository' | 'now' | 'rules'
	>,
	targetArchived: boolean
): CategoryService['archive'] {
	return async (userId, input) => {
		const current = await context.rules.requireCurrent(userId, input.id);

		context.rules.assertVersion(current.record, input.version);

		const currentlyArchived = current.record.category.archivedAt !== null;

		if (currentlyArchived === targetArchived) {
			return toPersistedCategory(current.record);
		}

		const timestamp = context.now();
		const record = await context.categoryRepository.setArchivedAt(
			current.householdId,
			input.id,
			input.version,
			targetArchived ? timestamp : null,
			timestamp
		);

		if (record === undefined) {
			throw new CategoryVersionConflictError();
		}

		return toPersistedCategory(record);
	};
}
