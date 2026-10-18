import { readSessionCookie } from './session-cookie';

/** The secret of the browser that started a Telegram sign-in (flow 5.1). Its hash is all the database keeps. */
export const TELEGRAM_LOGIN_COOKIE_NAME = 'i_finances_tg_login';
/** Sent only to the Telegram sign-in routes (`start`, `complete`, `cancel`, and `link/*` later), never elsewhere. */
const TELEGRAM_LOGIN_COOKIE_PATH = '/api/auth/telegram';

function secureAttribute(): string[] {
	return process.env.NODE_ENV === 'production' ? ['Secure'] : [];
}

export function readTelegramLoginCookie(request: Request): string | undefined {
	return readSessionCookie(request, TELEGRAM_LOGIN_COOKIE_NAME);
}

export function createTelegramLoginCookie(secret: string, maxAgeSeconds: number): string {
	return [
		`${TELEGRAM_LOGIN_COOKIE_NAME}=${encodeURIComponent(secret)}`,
		`Path=${TELEGRAM_LOGIN_COOKIE_PATH}`,
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${Math.max(1, Math.ceil(maxAgeSeconds))}`,
		...secureAttribute()
	].join('; ');
}

export function createClearedTelegramLoginCookie(): string {
	return [
		`${TELEGRAM_LOGIN_COOKIE_NAME}=`,
		`Path=${TELEGRAM_LOGIN_COOKIE_PATH}`,
		'HttpOnly',
		'SameSite=Lax',
		'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
		'Max-Age=0',
		...secureAttribute()
	].join('; ');
}
