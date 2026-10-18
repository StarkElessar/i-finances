/** The bot texts file does not match the registered keys and placeholders. */
export class TelegramMessagesError extends Error {
	public constructor(problems: string[]) {
		super(`Invalid Telegram bot texts: ${problems.join('; ')}.`);
		this.name = 'TelegramMessagesError';
	}
}
