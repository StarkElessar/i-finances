import { z } from 'zod';

import { telegramLoginCodeSchema } from './telegram-auth';

/**
 * Linking Telegram to the signed-in user (decision Р9, flow 5.3 in
 * `development/decisions/telegram-auth-and-households-v1.md`). The same bot and polling as the sign-in, but only from a
 * browser session (never the MCP key), and the session stays as it is.
 *
 * 1. `POST /api/auth/telegram/link/start` creates a `link` request for the current user and answers the bot links; the
 *    browser secret travels only in the httpOnly cookie, as for the sign-in.
 * 2. The person opens the bot, which names the account the Telegram is about to be linked to, and presses «Привязать».
 * 3. The browser polls `POST /api/auth/telegram/link/complete { code }` until the answer is not `pending`.
 *
 * `POST /api/auth/telegram/cancel { code }` abandons a link request too. There is no unlinking in v1 (Р9).
 */

export const telegramLinkErrorCodes = [
	'invalid-input',
	'invalid-origin',
	'unauthenticated',
	'rate-limited',
	'telegram-unavailable',
	'browser-mismatch',
	'link-expired',
	'link-rejected',
	'telegram-linked-elsewhere',
	'account-has-telegram',
	'payload-too-large',
	'unexpected'
] as const;

export type TelegramLinkErrorCode = (typeof telegramLinkErrorCodes)[number];

/** The two 409 texts are the ones of the «Безопасность» board (section 6, item 8). */
export const telegramLinkErrorMessageByCode: Record<TelegramLinkErrorCode, string> = {
	'invalid-input': 'Не удалось прочитать запрос. Обновите страницу и попробуйте снова.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	unauthenticated: 'Сеанс завершён. Войдите снова.',
	'rate-limited': 'Слишком много попыток. Попробуйте позже.',
	'telegram-unavailable': 'Привязка Telegram сейчас недоступна.',
	'browser-mismatch': 'Привязка начата в другом браузере. Начните её заново здесь.',
	'link-expired': 'Ссылка устарела. Попробуйте снова.',
	'link-rejected': 'Вы отклонили привязку в Telegram.',
	'telegram-linked-elsewhere': 'Этот Telegram привязан к другому аккаунту.',
	'account-has-telegram': 'К аккаунту уже привязан другой Telegram.',
	'payload-too-large': 'Слишком большой запрос.',
	unexpected: 'Не удалось привязать Telegram. Попробуйте ещё раз.'
};

export const telegramLinkFailureSchema = z.object({
	errorCode: z.enum(telegramLinkErrorCodes),
	message: z.string(),
	ok: z.literal(false)
});

export type TelegramLinkFailure = z.infer<typeof telegramLinkFailureSchema>;

export const telegramLinkStartResultSchema = z.discriminatedUnion('ok', [
	z.object({
		/** `tg://resolve?domain=<bot>&start=<code>`: opens the Telegram app directly. */
		appUrl: z.string().min(1),
		/** `https://t.me/<bot>?start=<code>`: the link of the «Привязать Telegram» button. */
		botUrl: z.url(),
		code: telegramLoginCodeSchema,
		expiresAt: z.string().min(1),
		ok: z.literal(true)
	}),
	telegramLinkFailureSchema
]);

export type TelegramLinkStartResult = z.infer<typeof telegramLinkStartResultSchema>;

export const telegramLinkCompleteResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		status: z.literal('pending')
	}),
	z.object({
		ok: z.literal(true),
		status: z.literal('linked'),
		/** What `GET /api/auth/session` now reports as `telegram`. */
		telegram: z.object({ username: z.string().nullable() })
	}),
	telegramLinkFailureSchema
]);

export type TelegramLinkCompleteResult = z.infer<typeof telegramLinkCompleteResultSchema>;
