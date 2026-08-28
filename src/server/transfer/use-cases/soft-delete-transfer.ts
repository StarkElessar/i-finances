import {
	type ChangeTransferDeletionStateInput,
	changeTransferDeletionStateInputSchema
} from '~/entities/transfer/api/transfer.contract';
import type { Transfer } from '~/entities/transfer/model/types';

import { TransferVersionConflictError } from '../transfer-errors';
import {
	resolveTransferLegIds,
	toTransfer
} from '../transfer-mappers';
import type { TransferUseCaseContext } from '../transfer-service.types';

/**
 * Creates the use case that soft-deletes a transfer together with both ledger legs.
 */
export function createSoftDeleteTransferUseCase(
	context: TransferUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: ChangeTransferDeletionStateInput
	): Promise<Transfer> => {
		const input = changeTransferDeletionStateInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const current = await context.rules.requireCurrent(
			household.id,
			input.id
		);

		context.rules.assertEditable(current.transfer);
		context.rules.assertVersion(current.transfer, input.version);

		const timestamp = context.now();
		const updated = await context.transferRepository.setDeletedAt(
			household.id,
			input.id,
			input.version,
			timestamp,
			userId,
			timestamp,
			userId
		);

		if (updated === undefined) {
			throw new TransferVersionConflictError();
		}

		return toTransfer(
			updated.transfer,
			resolveTransferLegIds(updated.legs),
			updated.transfer.contactNameSnapshot
		);
	};
}
