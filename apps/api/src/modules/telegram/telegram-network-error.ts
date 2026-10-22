/**
 * The request never produced a Telegram answer (DNS, connection reset, aborted by the caller). The underlying error is
 * not kept: transport errors may quote the request URL, and the URL contains the bot token.
 */
export class TelegramNetworkError extends Error {
	/** The system error code (`ECONNRESET`...) when there was one; safe to log. */
	public readonly code: string | undefined;
	public readonly method: string;

	public constructor(method: string, code?: string) {
		super(`Telegram ${method} could not be reached${code === undefined ? '' : ` (${code})`}.`);
		this.name = 'TelegramNetworkError';
		this.method = method;
		this.code = code;
	}
}
