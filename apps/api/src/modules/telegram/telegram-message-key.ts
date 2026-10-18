/**
 * Every bot text and the placeholders it may contain. `messages.ru.json` must hold exactly these keys, each with
 * exactly these `{placeholders}`; the loader refuses to start otherwise, so a typo cannot reach a user.
 * The wording comes from the "Bot-Telegram" board (`development/ui-mockup.md`).
 */
export const TELEGRAM_MESSAGE_PLACEHOLDERS = {
	'household.memberJoined': ['name', 'household'],
	'signIn.accountNotFound': [],
	'signIn.confirmation': ['device', 'when'],
	'signIn.confirmButton': [],
	'signIn.confirmed': [],
	'signIn.expired': [],
	'signIn.rejectButton': [],
	'signIn.rejected': [],
	'signIn.unknownDevice': [],
	'start.greeting': []
} as const satisfies Record<string, readonly string[]>;

export type TelegramMessageKey = keyof typeof TELEGRAM_MESSAGE_PLACEHOLDERS;

export const TELEGRAM_MESSAGE_KEYS = Object.keys(TELEGRAM_MESSAGE_PLACEHOLDERS) as TelegramMessageKey[];

/** Values for the placeholders of one key; keys without placeholders take no argument. */
export type TelegramMessageParameters<K extends TelegramMessageKey> = (typeof TELEGRAM_MESSAGE_PLACEHOLDERS)[K] extends readonly []
	? []
	: [values: Record<(typeof TELEGRAM_MESSAGE_PLACEHOLDERS)[K][number], string>];
