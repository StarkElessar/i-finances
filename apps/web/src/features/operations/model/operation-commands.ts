import type { OperationClient } from '@/features/operations/api';

import type { CreateOperationInput, PersistedOperation } from '@i-finances/contracts';
import { updateOperationInputSchema } from '@i-finances/contracts';

export function updateOperation(
	client: OperationClient,
	operation: PersistedOperation,
	fields: CreateOperationInput
) {
	return client.update(updateOperationInputSchema.parse({
		...fields,
		id: operation.id,
		version: operation.version
	}));
}
