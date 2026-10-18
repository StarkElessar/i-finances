import { TelegramApiError } from './telegram-api-error';

/**
 * 403: the bot may not write to this chat, typically "Forbidden: bot was blocked by the user". The caller records
 * `bot_blocked_at` and stops writing; retrying cannot help.
 */
export class TelegramForbiddenError extends TelegramApiError {
	public constructor(method: string, description: string) {
		super(method, 403, description);
		this.name = 'TelegramForbiddenError';
	}
}
