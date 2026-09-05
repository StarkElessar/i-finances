import { ApiHttpError } from '@/shared/api';

import { categoryCommandResultSchema } from '@i-finances/contracts';

export function resolveCategoryError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = categoryCommandResultSchema.safeParse(error.body);

		if (result.success && !result.data.ok) {
			return result.data.message;
		}
	}

	return 'Не удалось выполнить действие с категорией.';
}
