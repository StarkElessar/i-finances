import {
	readSessionCookie,
	readSessionCookieFromRequest
} from '~/server/auth/session/auth-cookie';
import type { AuthenticatedSession } from '~/server/auth/session/session-service';
import { validateSessionToken } from '~/server/auth/session/session-service';

/**
 * Signals that protected server work was requested without a valid session.
 */
export class AuthenticationRequiredError extends Error {
	readonly statusCode = 401;

	/**
	 * Creates a consistent authorization failure for server adapters.
	 */
	constructor() {
		super('Authentication required.');
		this.name = 'AuthenticationRequiredError';
	}
}

/**
 * Resolves the authenticated session from the active SolidStart context.
 */
export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
	return validateSessionToken(readSessionCookie());
}

/**
 * Resolves the authenticated session directly from a Fetch API request.
 */
export async function getSessionFromRequest(request: Request): Promise<AuthenticatedSession | null> {
	return validateSessionToken(readSessionCookieFromRequest(request));
}

/**
 * Requires an authenticated request before protected server work.
 *
 * @throws AuthenticationRequiredError when the session is missing or invalid.
 */
export async function requireUser(): Promise<AuthenticatedSession> {
	const session = await getCurrentSession();

	if (!session) {
		throw new AuthenticationRequiredError();
	}

	return session;
}
