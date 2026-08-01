import { OperationVersionConflictError } from '../operation-errors';
import { toOperation } from '../operation-mappers';
import type { OperationUseCaseContext } from '../operation-use-case.types';

import {
	type ChangeOperationDeletionStateInput,
	changeOperationDeletionStateInputSchema
} from '~/entities/operation/api/operation.contract';
import type { Operation } from '~/entities/operation/model/types';

export function createChangeOperationDeletionStateUseCase(
	context: OperationUseCaseContext,
	deleted: boolean
) {
	return async (
		userId: string,
		unsafeInput: ChangeOperationDeletionStateInput
	): Promise<Operation> => {
		const input = changeOperationDeletionStateInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const current = await context.rules.requireCurrent(household.id, input.id);

		context.rules.assertVersion(current, input.version);

		const alreadyInTargetState = deleted
			? current.deletedAt !== null
			: current.deletedAt === null;

		if (alreadyInTargetState) {
			return toOperation(current);
		}

		const timestamp = context.now();
		const updated = await context.operationRepository.setDeletedAt(
			household.id,
			current.id,
			input.version,
			deleted ? timestamp : null,
			deleted ? userId : null,
			timestamp,
			userId
		);

		if (updated === undefined) {
			throw new OperationVersionConflictError();
		}

		return toOperation(updated);
	};
}
