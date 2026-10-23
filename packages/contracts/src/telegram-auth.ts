import { z } from 'zod';

import { invitationTokenSchema } from './household-invitation';

/**
 * Sign-in and sign-up through the Telegram bot by deep link (decision Р1, flow 5.1 in
 * `development/decisions/telegram-auth-and-households-v1.md`).
 *
 * 1. `POST /api/auth/telegram/start { invitationToken? }` creates a request and answers the bot links; the secret that
 *    binds the request to this browser travels only in an httpOnly cookie, never in a body. The optional
 *    `invitationToken` is the token of the invitation link the person came with (into a household or into the
 *    application): while registration is closed, only such a person can sign up (`app-invitations-v1.md`). The answer
 *    is the same whether or not the token opens anything.
 * 2. The person opens the bot, presses «Войти» there.
 * 3. The browser polls `POST /api/auth/telegram/complete { code }` until the answer is not `pending`.
 * 4. `POST /api/auth/telegram/cancel { code }` abandons the request.
 *
 * Nothing about any user is answered before the request is confirmed.
 */

/** 24 random bytes in base64url. Telegram allows up to 64 characters of `A-Z a-z 0-9 _ -` in a `start` payload. */
export const TELEGRAM_LOGIN_CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export const telegramSignInErrorCodes = [
	'invalid-input',
	'invalid-origin',
	'rate-limited',
	'telegram-unavailable',
	'browser-mismatch',
	'login-expired',
	'login-rejected',
	'registration-closed',
	'account-disabled',
	'payload-too-large',
	'unexpected'
] as const;

export type TelegramSignInErrorCode = (typeof telegramSignInErrorCodes)[number];

export const telegramSignInErrorMessageByCode: Record<TelegramSignInErrorCode, string> = {
	'invalid-input': 'Не удалось прочитать запрос. Обновите страницу и попробуйте снова.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'rate-limited': 'Слишком много попыток входа. Попробуйте позже.',
	'telegram-unavailable': 'Вход через Telegram сейчас недоступен.',
	'browser-mismatch': 'Вход начат в другом браузере. Начните вход заново здесь.',
	'login-expired': 'Ссылка устарела. Попробуйте снова.',
	'login-rejected': 'Вы отклонили вход в Telegram.',
	'registration-closed': 'Аккаунт не найден. Войдите паролем или ключом доступа и привяжите Telegram в разделе «Безопасность».',
	'account-disabled': 'Аккаунт отключён. Обратитесь к владельцу окружения.',
	'payload-too-large': 'Слишком большой запрос.',
	unexpected: 'Не удалось войти. Попробуйте ещё раз.'
};

export const telegramSignInFailureSchema = z.object({
	errorCode: z.enum(telegramSignInErrorCodes),
	message: z.string(),
	ok: z.literal(false)
});

export type TelegramSignInFailure = z.infer<typeof telegramSignInFailureSchema>;

export const telegramLoginCodeSchema = z.string().regex(TELEGRAM_LOGIN_CODE_PATTERN);

export const telegramSignInStartResultSchema = z.discriminatedUnion('ok', [
	z.object({
		/** `tg://resolve?domain=<bot>&start=<code>`: opens the Telegram app directly. */
		appUrl: z.string().min(1),
		/** `https://t.me/<bot>?start=<code>`: the link of the «Войти через Telegram» button. */
		botUrl: z.url(),
		code: telegramLoginCodeSchema,
		expiresAt: z.string().min(1),
		ok: z.literal(true)
	}),
	telegramSignInFailureSchema
]);

export type TelegramSignInStartResult = z.infer<typeof telegramSignInStartResultSchema>;

/**
 * The body of `start`. An empty body is `{}`. A malformed `invitationToken` is `invalid-input` (400); a well-formed one
 * that opens nothing changes nothing in the answer: the request is then an ordinary sign-in.
 */
export const telegramSignInStartInputSchema = z.object({
	invitationToken: invitationTokenSchema.optional()
});

export type TelegramSignInStartInput = z.infer<typeof telegramSignInStartInputSchema>;

export const telegramSignInCodeInputSchema = z.object({
	code: telegramLoginCodeSchema
});

export type TelegramSignInCodeInput = z.infer<typeof telegramSignInCodeInputSchema>;

export const telegramSignInCompleteResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		status: z.literal('pending')
	}),
	z.object({
		/** `false` until the user has created a household or accepted an invitation (onboarding). */
		hasHousehold: z.boolean(),
		/** `true` when this sign-in created the account. */
		isNewUser: z.boolean(),
		ok: z.literal(true),
		status: z.literal('confirmed')
	}),
	telegramSignInFailureSchema
]);

export type TelegramSignInCompleteResult = z.infer<typeof telegramSignInCompleteResultSchema>;

export const telegramSignInCancelResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	telegramSignInFailureSchema
]);

export type TelegramSignInCancelResult = z.infer<typeof telegramSignInCancelResultSchema>;

/**
 * `POST /api/dev/telegram/confirm` (only with `DEV_TELEGRAM_LOGIN=true`, never in production): confirms a request on
 * behalf of the given Telegram identity, as the bot would after «Войти».
 */
export const devTelegramConfirmInputSchema = z.object({
	code: telegramLoginCodeSchema,
	firstName: z.string().trim().min(1).max(64),
	lastName: z.string().trim().min(1).max(64).optional(),
	telegramId: z.string().regex(/^[1-9]\d{0,19}$/),
	username: z.string().regex(/^[A-Za-z0-9_]{1,32}$/).optional()
});

export type DevTelegramConfirmInput = z.infer<typeof devTelegramConfirmInputSchema>;

export const devTelegramConfirmResultSchema = telegramSignInCancelResultSchema;

export type DevTelegramConfirmResult = z.infer<typeof devTelegramConfirmResultSchema>;
