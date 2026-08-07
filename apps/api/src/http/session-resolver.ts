import type { SessionService } from '../modules/auth';
import {
	type AuthenticatedSession
} from '../modules/auth';

export interface RequestSessionResolver {
	resolve(request: Request): Promise<AuthenticatedSession | null>;
}

/**
 * Resolves the opaque session token from a Fetch API cookie.
 */
export class CookieSessionResolver implements RequestSessionResolver {
	public constructor(
		private readonly sessionService: SessionService,
		private readonly cookieName: string = process.env.SESSION_COOKIE_NAME ?? 'i_finances_session'
	) {}

	public resolve(request: Request): Promise<AuthenticatedSession | null> {
		return this.sessionService.validateSessionToken(
			this.readSessionCookie(request)
		);
	}

	private readSessionCookie(request: Request): string | undefined {
		const cookieHeader = request.headers.get('cookie');

		if (cookieHeader === null) {
			return undefined;
		}

		for (const part of cookieHeader.split(';')) {
			const separatorIndex = part.indexOf('=');

			if (separatorIndex === -1) {
				continue;
			}

			const name = part.slice(0, separatorIndex).trim();

			if (name === this.cookieName) {
				return this.decodeCookieValue(part.slice(separatorIndex + 1).trim());
			}
		}

		return undefined;
	}

	private decodeCookieValue(value: string): string {
		try {
			return decodeURIComponent(value);
		}
		catch {
			return value;
		}
	}
}
