/**
 * The request never produced a Telegram answer (DNS, connection reset, aborted by the caller). The underlying error is
 * not kept: transport errors may quote the request URL, and the URL contains the bot token.
 */
export class TelegramNetworkError extends Error {
	public readonly method: string;

	public constructor(method: string, code?: string) {
		super(`Telegram ${method} could not be reached${code === undefined ? '' : ` (${code})`}.`);
		this.name = 'TelegramNetworkError';
		this.method = method;
	}
}
