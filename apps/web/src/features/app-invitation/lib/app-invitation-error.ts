import { ApiHttpError } from '@/shared/api';

export const APP_INVITATION_ACCESS_LOST = 'Приглашения в приложение доступны только администратору. Возможно, ваши права изменились.';

export const APP_INVITATION_NETWORK_ERROR = 'Не удалось выполнить действие. Проверьте соединение и повторите.';

export function describeAppInvitationError(error: unknown): { forbidden: boolean; message: string } {
	if (error instanceof ApiHttpError) {
		if (error.status === 401) {
			return { forbidden: true, message: 'Сеанс завершён. Войдите в приложение снова.' };
		}

		if (error.status === 403 || error.status === 404) {
			return { forbidden: true, message: APP_INVITATION_ACCESS_LOST };
		}

		return { forbidden: false, message: 'Не удалось выполнить действие. Попробуйте ещё раз.' };
	}

	return { forbidden: false, message: APP_INVITATION_NETWORK_ERROR };
}
