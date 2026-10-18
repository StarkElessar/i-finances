import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const CODE_BYTES = 24;
const SECRET_BYTES = 32;
/** Compared against when the browser sent no cookie, so that both paths hash and compare. */
const ABSENT_SECRET_HASH = '0'.repeat(64);

/** The public part, in the bot link: 24 random bytes, 32 base64url characters (Telegram allows 64). */
export function generateTelegramLoginCode(): string {
	return randomBytes(CODE_BYTES).toString('base64url');
}

/** The browser's part, in an httpOnly cookie only: 32 random bytes. */
export function generateTelegramLoginSecret(): string {
	return randomBytes(SECRET_BYTES).toString('base64url');
}

/** Only this SHA-256 hex lands in `telegram_login_requests.secret_hash`. */
export function hashTelegramLoginSecret(secret: string): string {
	return createHash('sha256').update(secret).digest('hex');
}

/**
 * Whether the cookie secret belongs to the stored hash, in constant time. A missing secret or a stored value that is
 * not a SHA-256 hex never matches.
 */
export function telegramLoginSecretMatches(storedHash: string | undefined, secret: string | undefined): boolean {
	const expected = Buffer.from(storedHash ?? ABSENT_SECRET_HASH, 'hex');
	const provided = Buffer.from(hashTelegramLoginSecret(secret ?? ''), 'hex');

	if (expected.length !== provided.length) {
		return false;
	}

	return timingSafeEqual(expected, provided) && storedHash !== undefined && secret !== undefined && secret !== '';
}
