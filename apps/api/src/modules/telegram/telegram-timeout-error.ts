/** Telegram did not answer within the request timeout. */
export class TelegramTimeoutError extends Error {
	public readonly method: string;

	public constructor(method: string, timeoutMilliseconds: number) {
		super(`Telegram ${method} timed out after ${timeoutMilliseconds} ms.`);
		this.name = 'TelegramTimeoutError';
		this.method = method;
	}
}
