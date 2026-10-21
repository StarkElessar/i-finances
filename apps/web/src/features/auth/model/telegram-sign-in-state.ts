/**
 * The bot links of one sign-in request, exactly as this browser's own `start` answered them. The code is never taken
 * from the address bar or storage: a code from anywhere else would be someone else's request (Р11).
 */
export type TelegramSignInLink = {
	appUrl: string;
	botUrl: string;
	code: string;
	/** On this browser's clock. */
	expiresAtMs: number;
	/** Lifetime of the request in whole minutes, for «Заявка действует 10 минут». */
	ttlMinutes: number;
};

/**
 * Why the flow stopped, one per state of the `Auth-Telegram` board, plus the ones the board has no picture for.
 */
export type TelegramSignInFailureReason =
	| 'account-disabled'
	| 'browser-mismatch'
	| 'expired'
	| 'network'
	| 'rate-limited'
	| 'registration-closed'
	| 'rejected'
	| 'unexpected';

export type TelegramSignInState =
	/** Before the first `start`. */
	| { kind: 'idle' }
	/** `start` (or the `cancel` before a restart) is in flight: the button is disabled with a spinner. */
	| { kind: 'preparing' }
	/** The link is known: the button is a plain link to the bot. */
	| { kind: 'ready'; link: TelegramSignInLink }
	/** The person went to the bot; the browser polls `complete`. */
	| { kind: 'waiting'; link: TelegramSignInLink; connectionLost: boolean }
	/** The session cookie is set. */
	| { kind: 'confirmed'; hasHousehold: boolean; isNewUser: boolean }
	| {
		kind: 'failed';
		reason: TelegramSignInFailureReason;
		/** The contract text for the reason, for those the board does not word itself. */
		message: string;
		retryAfterSeconds?: number;
		/** Lifetime of the expired request, for «Прошло больше 10 минут». */
		ttlMinutes?: number;
	}
	/** Telegram is switched off on the server (404 `telegram-unavailable`): no Telegram button at all. */
	| { kind: 'unavailable' };
