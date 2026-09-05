import { ApiHttpError } from '@/shared/api';

import { receiptImportCommandResultSchema } from '@i-finances/contracts';

export function resolveReceiptError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = receiptImportCommandResultSchema.safeParse(error.body);

		if (result.success) {
			return result.data.ok ? 'Неожиданный ответ сервера.' : result.data.message;
		}

		if (typeof error.body === 'object' && error.body !== null && 'message' in error.body) {
			const message = (error.body as { message?: unknown }).message;

			if (typeof message === 'string') {
				return message;
			}
		}

		return 'Сервис чеков временно недоступен.';
	}

	return 'Не удалось выполнить операцию с чеком.';
}
