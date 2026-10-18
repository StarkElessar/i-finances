import type { SignInMethods } from './sign-in-methods-repository';

/**
 * The `userName` a passkey is registered with; password managers show it next to the key (Р13, A10).
 *
 * A user with a password signs in with `username`, so that is the name. A user who came through Telegram has the
 * technical `tg-<telegram id>` that nobody types and the interface never shows: the key is named after the Telegram
 * `@username` instead, or the display name when there is none.
 */
export function choosePasskeyUserName(methods: Pick<SignInMethods, 'displayName' | 'hasPassword' | 'telegram' | 'username'>): string {
	if (methods.hasPassword) {
		return methods.username;
	}

	const telegramUsername = methods.telegram?.username;

	if (telegramUsername !== undefined && telegramUsername !== null && telegramUsername !== '') {
		return `@${telegramUsername}`;
	}

	return methods.displayName.trim() === '' ? methods.username : methods.displayName;
}
