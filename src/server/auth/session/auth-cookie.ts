import { deleteCookie, getCookie, setCookie } from '@solidjs/start/http';

import { getAuthConfig } from '~/server/auth/auth-config';

/**
 * Safely decodes one cookie value without rejecting the whole request.
 */
function decodeCookieValue(value: string): string {
	try {
		return decodeURIComponent(value);
	}
	catch {
		return value;
	}
}

/**
 * Reads the session token from the active SolidStart request context.
 */
export function readSessionCookie(): string | undefined {
	return getCookie(getAuthConfig().sessionCookieName);
}

/**
 * Reads the session token directly from a Fetch API request.
 */
export function readSessionCookieFromRequest(request: Request): string | undefined {
	const cookieName = getAuthConfig().sessionCookieName;
	const cookieHeader = request.headers.get('cookie');

	if (!cookieHeader) {
		return undefined;
	}

	for (const part of cookieHeader.split(';')) {
		const separatorIndex = part.indexOf('=');

		if (separatorIndex === -1) {
			continue;
		}

		const name = part.slice(0, separatorIndex).trim();

		if (name === cookieName) {
			return decodeCookieValue(part.slice(separatorIndex + 1).trim());
		}
	}

	return undefined;
}

/**
 * Writes the opaque token into a hardened browser cookie.
 */
export function writeSessionCookie(token: string, expiresAt: Date): void {
	setCookie(getAuthConfig().sessionCookieName, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		expires: expiresAt
	});
}

/**
 * Removes the browser session cookie.
 */
export function clearSessionCookie(): void {
	deleteCookie(getAuthConfig().sessionCookieName, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/'
	});
}
