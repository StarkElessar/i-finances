/**
 * Every bot text and the placeholders it may contain. `messages.ru.json` must hold exactly these keys, each with
 * exactly these `{placeholders}`; the loader refuses to start otherwise, so a typo cannot reach a user.
 * The wording comes from the "Bot-Telegram" board (`development/ui-mockup.md`).
 *
 * - `site`: the host of `AUTH_ORIGIN` (`TelegramConfig.siteHost`). The device and time of a request are chosen by
 *   whoever started it, so only the site, which we name, tells a person what they are about to confirm (Р11).
 * - `account` and `login`: the display name and the login of the account that started a link. The display name can
 *   be anything; the login is unique, so the person can tell their own account from a look-alike (Р11, A4).
 */
export const TELEGRAM_MESSAGE_PLACEHOLDERS = {
	'household.memberJoined': ['name', 'household'],
	'link.accountHasTelegram': ['account', 'login'],
	'link.confirmation': ['account', 'login', 'device', 'when', 'site'],
	'link.confirmButton': [],
	'link.confirmed': [],
	'link.expired': [],
	'link.rejectButton': [],
	'link.rejected': [],
	'link.telegramTaken': [],
	'signIn.accountNotFound': [],
	'signIn.confirmation': ['device', 'when', 'site'],
	'signIn.confirmButton': [],
	'signIn.confirmed': [],
	'signIn.expired': [],
	'signIn.rejectButton': [],
	'signIn.rejected': [],
	'signIn.unknownDevice': [],
	'start.greeting': ['site']
} as const satisfies Record<string, readonly string[]>;

export type TelegramMessageKey = keyof typeof TELEGRAM_MESSAGE_PLACEHOLDERS;

export const TELEGRAM_MESSAGE_KEYS = Object.keys(TELEGRAM_MESSAGE_PLACEHOLDERS) as TelegramMessageKey[];

/** Values for the placeholders of one key; keys without placeholders take no argument. */
export type TelegramMessageParameters<K extends TelegramMessageKey> = (typeof TELEGRAM_MESSAGE_PLACEHOLDERS)[K] extends readonly []
	? []
	: [values: Record<(typeof TELEGRAM_MESSAGE_PLACEHOLDERS)[K][number], string>];
