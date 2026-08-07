/**
 * Rejects cross-origin browser mutations while allowing non-browser callers
 * that do not send an Origin header.
 */
export function isSameOriginMutation(request: Request): boolean {
	const origin = request.headers.get('origin');

	return origin === null || origin === (process.env.AUTH_ORIGIN ?? 'http://localhost:5173');
}
