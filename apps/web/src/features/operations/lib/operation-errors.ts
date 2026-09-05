import { ApiHttpError } from '@/shared/api';

import { operationCommandResultSchema } from '@i-finances/contracts';

export function resolveOperationError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = operationCommandResultSchema.safeParse(error.body);

		if (result.success && !result.data.ok) {
			return result.data.message;
		}
	}

	return 'Не удалось выполнить действие с операцией.';
}
