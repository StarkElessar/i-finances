import {
	type GetContactOperationsInput,
	getContactOperationsInputSchema
} from '~/entities/operation/api/operation.contract';
import type { ContactOperations } from '~/entities/operation/model/types';

import { OperationReferenceUnavailableError } from '../operation-errors';
import { toOperation } from '../operation-mappers';
import type { OperationUseCaseContext } from '../operation-use-case.types';

/**
 * Builds a use case that lists household operations for one contact and date range.
 */
export function createGetContactOperationsUseCase(
	context: OperationUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: GetContactOperationsInput
	): Promise<ContactOperations> => {
		const input = getContactOperationsInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const contact = await context.contactRepository.findById(
			household.id,
			input.contactId
		);

		if (contact === undefined) {
			throw new OperationReferenceUnavailableError('contactId');
		}

		const rows = await context.operationRepository.listByContact(
			household.id,
			input.contactId,
			input.start,
			input.end
		);

		return {
			contactId: input.contactId,
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
