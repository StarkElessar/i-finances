import {
	type GetTransferInput,
	getTransferInputSchema
} from '~/entities/transfer/api/transfer.contract';
import type { Transfer } from '~/entities/transfer/model/types';

import {
	resolveTransferLegIds,
	toTransfer
} from '../transfer-mappers';
import type { TransferUseCaseContext } from '../transfer-service.types';

/**
 * Creates the use case that loads one transfer with linked operation ids.
 */
export function createGetTransferUseCase(
	context: TransferUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: GetTransferInput
	): Promise<Transfer> => {
		const input = getTransferInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const current = await context.rules.requireCurrent(
			household.id,
			input.id
		);

		return toTransfer(
			current.transfer,
			resolveTransferLegIds(current.legs),
			current.transfer.contactNameSnapshot
		);
	};
}
