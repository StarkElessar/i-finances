import { normalizeUsername } from './normalize-username';

/**
 * Usernames that start with this prefix belong to users created by a Telegram sign-up (`tg-<telegram id>`, Р3 in
 * `development/decisions/telegram-auth-and-households-v1.md`).
 */
export const TELEGRAM_USERNAME_PREFIX = 'tg-';

/**
 * Tells whether a username is reserved for users who come from Telegram. A hand-made user (`seed-auth-user.ts`) must not
 * take such a name: it would collide with a future Telegram sign-up of that id and read as a Telegram-only account.
 * The comparison uses the normalized form, so `TG-1` and ` tg-1 ` are reserved too.
 */
export function isReservedUsername(username: string): boolean {
	return normalizeUsername(username).startsWith(TELEGRAM_USERNAME_PREFIX);
}
