/**
 * The command line of `reset-user-telegram` is wrong (missing username, unknown flag).
 */
export class ResetUserTelegramUsageError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ResetUserTelegramUsageError';
	}
}
