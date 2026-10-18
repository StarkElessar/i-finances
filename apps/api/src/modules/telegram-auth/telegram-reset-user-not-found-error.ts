/**
 * No user has the username given to `reset-user-telegram`.
 */
export class TelegramResetUserNotFoundError extends Error {
	public constructor(public readonly username: string) {
		super(`No user with the username "${username}".`);
		this.name = 'TelegramResetUserNotFoundError';
	}
}
