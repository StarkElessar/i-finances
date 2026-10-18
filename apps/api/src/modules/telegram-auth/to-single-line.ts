const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUNS = /\s+/gu;

/**
 * One line without control and formatting characters (no line breaks or direction overrides), cut to `maxLength`.
 * Names that Telegram or a user supplies go through it before they are put into a bot text.
 */
export function toSingleLine(text: string, maxLength: number): string {
	return text.replace(CONTROL_CHARACTERS, ' ').replace(WHITESPACE_RUNS, ' ').trim().slice(0, maxLength);
}
