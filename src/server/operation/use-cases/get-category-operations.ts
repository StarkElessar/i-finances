import {
	type GetCategoryOperationsInput,
	getCategoryOperationsInputSchema
} from '~/entities/operation/api/operation.contract';
import type { CategoryOperations } from '~/entities/operation/model/types';

import { OperationReferenceUnavailableError } from '../operation-errors';
import { toOperation } from '../operation-mappers';
import type { OperationUseCaseContext } from '../operation-use-case.types';

/**
 * Builds a use case that lists household operations for one category and date range.
 */
export function createGetCategoryOperationsUseCase(
	context: OperationUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: GetCategoryOperationsInput
	): Promise<CategoryOperations> => {
		const input = getCategoryOperationsInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const category = await context.categoryRepository.findById(
			household.id,
			input.categoryId
		);

		if (category === undefined) {
			throw new OperationReferenceUnavailableError('categoryId');
		}

		const rows = await context.operationRepository.listByCategory(
			household.id,
			input.categoryId,
			input.start,
			input.end
		);

		return {
			categoryId: input.categoryId,
			householdBaseCurrency: household.baseCurrency,
			items: rows.map((row) => ({
				...toOperation(row.operation, {
					categoryName: row.categoryName,
					contactName: row.contactName
				}),
				accountName: row.accountName
			})),
			range: {
				end: input.end,
				start: input.start
			}
		};
	};
}
