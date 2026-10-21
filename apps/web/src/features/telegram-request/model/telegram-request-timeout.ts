/**
 * A Telegram request sends one request at a time and waits for it before the next (the request cookie, the poll), so a
 * request the server never answers would stall the whole flow. It is given up after this long instead.
 */
export const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;

export function telegramRequestInit(): Pick<RequestInit, 'signal'> {
	return { signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS) };
}
