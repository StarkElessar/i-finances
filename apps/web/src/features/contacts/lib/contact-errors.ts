import { ApiHttpError } from '@/shared/api';

import { contactCommandResultSchema } from '@i-finances/contracts';

export function resolveContactError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = contactCommandResultSchema.safeParse(error.body);

		if (result.success && !result.data.ok) {
			return result.data.message;
		}
	}

	return 'Не удалось выполнить действие с контактом.';
}
