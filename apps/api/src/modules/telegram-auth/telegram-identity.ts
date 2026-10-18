import type { TelegramUser } from '@/modules/telegram';

/** Longest name Telegram allows is 64 characters; anything longer is not from Telegram and is cut. */
const MAX_NAME_LENGTH = 64;
const MAX_USERNAME_LENGTH = 32;

/**
 * Who confirmed a request, as Telegram reported it in the update (`callback_query.from`). Never taken from a browser
 * request (Р11): only the webhook (behind its secret), polling, or the dev confirmation produce it.
 */
export type TelegramIdentity = {
	/** The private chat with the bot, for notifications. */
	chatId: string;
	firstName: string;
	lastName: string | null;
	telegramId: string;
	/** Without `@`. */
	username: string | null;
};

export function toTelegramIdentity(user: TelegramUser, chatId: number | string): TelegramIdentity {
	return {
		chatId: String(chatId),
		firstName: user.first_name.slice(0, MAX_NAME_LENGTH),
		lastName: user.last_name === undefined || user.last_name === '' ? null : user.last_name.slice(0, MAX_NAME_LENGTH),
		telegramId: String(user.id),
		username: user.username === undefined || user.username === '' ? null : user.username.slice(0, MAX_USERNAME_LENGTH)
	};
}
