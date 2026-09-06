import { TransferClient } from '@/features/transfers/api';

import { resolveCommandResult } from '@/shared/api';

import type {
	ChangeTransferDeletionStateInput,
	CreateTransferInput,
	GetTransferInput,
	Transfer,
	TransferCommandResult,
	UpdateTransferInput
} from '@i-finances/contracts';
import { transferCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new TransferClient();

export const getTransfer = query(
	async (input: GetTransferInput): Promise<Transfer> => {
		const result = await client.get(input);

		if (!result.ok) {
			throw new Error(result.message);
		}

		return result.transfer;
	},
	'transfer'
);

export const createTransferAction = action(
	(input: CreateTransferInput): Promise<TransferCommandResult> => resolveCommandResult(
		() => client.create(input),
		transferCommandResultSchema
	),
	'create-transfer'
);

export const updateTransferAction = action(
	(input: UpdateTransferInput): Promise<TransferCommandResult> => resolveCommandResult(
		() => client.update(input),
		transferCommandResultSchema
	),
	'update-transfer'
);

export const deleteTransferAction = action(
	(input: ChangeTransferDeletionStateInput): Promise<TransferCommandResult> => resolveCommandResult(
		() => client.delete(input),
		transferCommandResultSchema
	),
	'delete-transfer'
);
