/** The same limit as `updateDisplayNameInputSchema`. */
const MAX_ACCOUNT_NAME_LENGTH = 100;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUNS = /\s+/gu;

/**
 * The account the bot names in «Привязать Telegram-аккаунт к i-finances? (аккаунт «…»)»: the display name of the user
 * who started the link, as one line without control and formatting characters (no line breaks or direction overrides
 * that could make the bot text read as something else). The message goes out without `parse_mode`, so no markup.
 */
export function describeLinkAccount(displayName: string, username: string): string {
	const name = displayName.replace(CONTROL_CHARACTERS, ' ').replace(WHITESPACE_RUNS, ' ').trim();

	return (name === '' ? username : name).slice(0, MAX_ACCOUNT_NAME_LENGTH);
}
