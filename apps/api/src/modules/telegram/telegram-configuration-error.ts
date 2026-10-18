/**
 * The Telegram environment is unusable. The message names variables and rules, never their values.
 */
export class TelegramConfigurationError extends Error {
	public constructor(problems: string[]) {
		super(`Invalid Telegram configuration: ${problems.join('; ')}.`);
		this.name = 'TelegramConfigurationError';
	}
}
