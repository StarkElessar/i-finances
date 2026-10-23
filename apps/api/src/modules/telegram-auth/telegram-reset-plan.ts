/**
 * What `reset-user-telegram` would do to one user: read-only facts gathered before anything is changed.
 */
export type TelegramResetPlan = {
	displayName: string;
	/** Whether the user can sign in with a password (`hasUsablePassword`). */
	hasPassword: boolean;
	isActive: boolean;
	/**
	 * `pending` or `confirmed` Telegram login requests that would be revoked: link requests of this user and
	 * requests confirmed by the Telegram account that is being unlinked.
	 */
	openLoginRequestCount: number;
	passkeyCount: number;
	/** All session rows of the user; they are deleted only with `--end-sessions`. */
	sessionCount: number;
	/** The Telegram link that would be removed, or `undefined` when the user has none (nothing to do). */
	telegram: TelegramResetPlanAccount | undefined;
	userId: string;
	username: string;
};

/**
 * The linked Telegram account as shown to the operator (no chat id, no tokens).
 */
export type TelegramResetPlanAccount = {
	firstName: string;
	linkedAt: Date;
	telegramId: string;
	username: string | null;
};

/**
 * What a reset changed. `accountRemoved: false` means nothing was touched: the link had already changed since the plan,
 * or (`lockoutRefused`) the user had no other way to sign in by the time of the transaction.
 */
export type TelegramResetResult = {
	accountRemoved: boolean;
	/** Refused without `--allow-lockout`: no usable password and no passkey any more. */
	lockoutRefused: boolean;
	requestsRevoked: number;
	sessionsEnded: number;
};
