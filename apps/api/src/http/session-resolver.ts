import type { SessionService } from '@/modules/auth';
import {
	type AuthenticatedSession,
	getAuthConfig
} from '@/modules/auth';

import { readSessionCookie } from './session-cookie';

export interface RequestSessionResolver {
	resolve(request: Request): Promise<AuthenticatedSession | null>;
}

/**
 * Resolves the opaque session token from a Fetch API cookie.
 */
export class CookieSessionResolver implements RequestSessionResolver {
	public constructor(
		private readonly sessionService: SessionService,
		private readonly cookieName: string = getAuthConfig().sessionCookieName
	) {}

	public resolve(request: Request): Promise<AuthenticatedSession | null> {
		return this.sessionService.validateSessionToken(readSessionCookie(request, this.cookieName));
	}
}
