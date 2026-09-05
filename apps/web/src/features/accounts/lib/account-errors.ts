import { ApiHttpError } from '@/shared/api';

import { accountCommandResultSchema } from '@i-finances/contracts';

export function resolveAccountError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = accountCommandResultSchema.safeParse(error.body);

		if (result.success && !result.data.ok) {
			return result.data.message;
		}
	}

	return 'Не удалось выполнить действие со счётом.';
}
