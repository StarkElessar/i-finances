import type { TelegramRequestState } from '@/features/telegram-request';

/** Why the link stopped, one per error text of the `D-Security` board plus the ones the board has no picture for. */
export type TelegramLinkFailureReason =
	| 'account-has-telegram'
	| 'browser-mismatch'
	| 'expired'
	| 'linked-elsewhere'
	| 'network'
	| 'rate-limited'
	| 'rejected'
	| 'unexpected';

/** What the confirmation carries: the Telegram the server linked, as `link/complete` answered it. */
export type TelegramLinkConfirmed = {
	telegram: { username: string | null };
};

export type TelegramLinkState = TelegramRequestState<TelegramLinkConfirmed, TelegramLinkFailureReason>;
