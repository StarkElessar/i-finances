import { toSingleLine } from './to-single-line';

/** The same limit as `updateDisplayNameInputSchema`. */
const MAX_ACCOUNT_NAME_LENGTH = 100;

/**
 * The account the bot names in «Привязать этот Telegram к аккаунту i-finances «…» (логин …)?»: the display name of the
 * user who started the link, as one line without control and formatting characters (no line breaks or direction
 * overrides that could make the bot text read as something else). The message goes out without `parse_mode`, so no
 * markup.
 */
export function describeLinkAccount(displayName: string, username: string): string {
	const name = toSingleLine(displayName, MAX_ACCOUNT_NAME_LENGTH);

	return name === '' ? toSingleLine(username, MAX_ACCOUNT_NAME_LENGTH) : name;
}

/**
 * The login (`users.username`) the bot names next to the display name. Anybody can call their account «Сергей», but the
 * login is unique, so it is what tells the person whether the account is their own (Р11, A4). Cleaned like the name.
 */
export function describeLinkLogin(username: string): string {
	return toSingleLine(username, MAX_ACCOUNT_NAME_LENGTH);
}
