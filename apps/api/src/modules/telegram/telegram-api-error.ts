/**
 * Telegram answered `ok: false` (or something that is not a Bot API answer at all). The message carries the method
 * name and Telegram's own description, never the request URL, which contains the bot token.
 */
export class TelegramApiError extends Error {
	public readonly description: string;
	public readonly errorCode: number;
	public readonly method: string;

	public constructor(method: string, errorCode: number, description: string) {
		super(`Telegram ${method} failed (${errorCode}): ${description}`);
		this.name = 'TelegramApiError';
		this.method = method;
		this.errorCode = errorCode;
		this.description = description;
	}
}
