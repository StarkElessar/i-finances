/**
 * The bot links of one Telegram request (sign-in or link), exactly as this browser's own `start` answered them. The
 * code is never taken from the address bar or storage: a code from anywhere else would be someone else's request (Р11).
 */
export type TelegramRequestLink = {
	appUrl: string;
	botUrl: string;
	code: string;
	/** On this browser's clock. */
	expiresAtMs: number;
	/** Lifetime of the request in whole minutes, for «Заявка действует 10 минут». */
	ttlMinutes: number;
};

/** Reasons every Telegram request can stop for, besides the ones its own protocol names. */
export type TelegramRequestCommonReason = 'network' | 'unexpected';

/**
 * The state of a Telegram request flow. `TConfirmed` is what the confirmation carries (sign-in: the household flags,
 * link: the linked Telegram), `TReason` the failure reasons of that kind of request.
 */
export type TelegramRequestState<TConfirmed extends object, TReason extends string> =
	/** Before the first `start`. */
	| { kind: 'idle' }
	/** `start` (or the `cancel` before a restart) is in flight: the button is disabled with a spinner. */
	| { kind: 'preparing' }
	/** The link is known: the button is a plain link to the bot. */
	| { kind: 'ready'; link: TelegramRequestLink }
	/** The person went to the bot; the browser polls `complete`. */
	| { kind: 'waiting'; link: TelegramRequestLink; connectionLost: boolean }
	/** The server confirmed (sign-in: the session cookie is set; link: Telegram is linked). */
	| ({ kind: 'confirmed' } & TConfirmed)
	| {
		kind: 'failed';
		reason: TelegramRequestCommonReason | TReason;
		/** The contract text for the reason, for those the board does not word itself. */
		message: string;
		retryAfterSeconds?: number;
		/** Lifetime of the expired request, for «Прошло больше 10 минут». */
		ttlMinutes?: number;
	}
	/** Telegram is switched off on the server (404 `telegram-unavailable`). */
	| { kind: 'unavailable' };
