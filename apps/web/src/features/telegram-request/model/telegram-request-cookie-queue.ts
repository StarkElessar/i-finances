/**
 * The request cookie (`i_finances_tg_login`) is one per browser, not one per flow: the sign-in screen, the link block
 * and a block opened again after it was closed all write the same cookie. A flow that was disposed may still have a
 * request on its way, and a late `Set-Cookie` of that request would replace the cookie of a newer request. So every
 * request that may set or clear the cookie goes through this one queue for the life of the page, and a new `start`
 * waits until the earlier ones have settled.
 */
let lastCookieRequest: Promise<void> = Promise.resolve();

/** Registers a request that may set or clear the request cookie; returns it unchanged. */
export function trackTelegramCookieRequest<TResult>(request: Promise<TResult>): Promise<TResult> {
	const settled = request.then(() => undefined, () => undefined);

	lastCookieRequest = Promise.all([lastCookieRequest, settled]).then(() => undefined);

	return request;
}

/** Settles when every request registered so far has settled (never rejects). */
export function afterTelegramCookieRequests(): Promise<void> {
	return lastCookieRequest;
}

/** For tests: forget the requests of earlier tests. */
export function resetTelegramCookieQueue(): void {
	lastCookieRequest = Promise.resolve();
}
