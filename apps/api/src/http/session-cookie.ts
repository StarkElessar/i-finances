import type { AuthConfig } from '@/modules/auth';

export function readSessionCookie(
	request: Request,
	cookieName: string
): string | undefined {
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

		if (name === cookieName) {
			return decodeCookieValue(part.slice(separatorIndex + 1).trim());
		}
	}

	return undefined;
}

export function createSessionCookie(
	config: AuthConfig,
	token: string,
	expiresAt: Date
): string {
	return [
		`${config.sessionCookieName}=${encodeURIComponent(token)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Expires=${expiresAt.toUTCString()}`,
		...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])
	].join('; ');
}

export function createClearedSessionCookie(config: AuthConfig): string {
	return [
		`${config.sessionCookieName}=`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
		'Max-Age=0',
		...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])
	].join('; ');
}

function decodeCookieValue(value: string): string {
	try {
		return decodeURIComponent(value);
	}
	catch {
		return value;
	}
}
