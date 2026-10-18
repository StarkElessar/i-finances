import { TelegramApiError } from './telegram-api-error';

/**
 * 429: Telegram asks to wait `retryAfterSeconds` before the next call. The client does not retry by itself; the
 * caller decides whether waiting is worth it (polling waits, a notification gives up).
 */
export class TelegramRateLimitedError extends TelegramApiError {
	public readonly retryAfterSeconds: number;

	public constructor(method: string, description: string, retryAfterSeconds: number) {
		super(method, 429, description);
		this.name = 'TelegramRateLimitedError';
		this.retryAfterSeconds = retryAfterSeconds;
	}
}
