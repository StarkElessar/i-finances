/** The same limit as `updateDisplayNameInputSchema`. */
const MAX_ACCOUNT_NAME_LENGTH = 100;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUNS = /\s+/gu;

/** One line without control and formatting characters (no line breaks or direction overrides), cut to the limit. */
function toSingleLine(text: string): string {
	return text.replace(CONTROL_CHARACTERS, ' ').replace(WHITESPACE_RUNS, ' ').trim().slice(0, MAX_ACCOUNT_NAME_LENGTH);
}

/**
 * The account the bot names in «Привязать этот Telegram к аккаунту i-finances «…» (логин …)?»: the display name of the
 * user who started the link, as one line without control and formatting characters (no line breaks or direction
 * overrides that could make the bot text read as something else). The message goes out without `parse_mode`, so no
 * markup.
 */
export function describeLinkAccount(displayName: string, username: string): string {
	const name = toSingleLine(displayName);

	return name === '' ? toSingleLine(username) : name;
}

/**
 * The login (`users.username`) the bot names next to the display name. Anybody can call their account «Сергей», but the
 * login is unique, so it is what tells the person whether the account is their own (Р11, A4). Cleaned like the name.
 */
export function describeLinkLogin(username: string): string {
	return toSingleLine(username);
}
