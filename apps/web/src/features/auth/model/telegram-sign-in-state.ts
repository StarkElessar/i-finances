import type { TelegramRequestLink, TelegramRequestState } from '@/features/telegram-request';

/**
 * The bot links of one sign-in request, exactly as this browser's own `start` answered them. The code is never taken
 * from the address bar or storage: a code from anywhere else would be someone else's request (Р11).
 */
export type TelegramSignInLink = TelegramRequestLink;

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

/** What the confirmation carries: the session cookie is set, and this says where the person goes next. */
export type TelegramSignInConfirmed = {
	hasHousehold: boolean;
	isNewUser: boolean;
};

export type TelegramSignInState = TelegramRequestState<TelegramSignInConfirmed, TelegramSignInFailureReason>;
