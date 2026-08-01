import { z } from 'zod';

/**
 * Stable client-facing failure reasons for the password sign-in flow.
 */
export const passwordSignInErrorCodes = [
	'invalid-input',
	'invalid-credentials',
	'rate-limited',
	'invalid-origin',
	'unexpected'
] as const;

/**
 * User-facing messages shared by server responses and query fallback.
 */
export const passwordSignInErrorMessageByCode: Record<PasswordSignInErrorCode, string> = {
	'invalid-input': 'Проверьте поля формы.',
	'invalid-credentials': 'Не удалось войти. Проверьте логин и пароль.',
	'rate-limited': 'Слишком много попыток входа. Попробуйте позже.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	unexpected: 'Не удалось войти. Попробуйте ещё раз.'
};

/**
 * Validates credentials and redirect intent submitted by the password form.
 */
export const passwordSignInInputSchema = z.object({
	username: z.string()
		.trim()
		.min(3, 'Введите логин.')
		.max(64, 'Логин слишком длинный.')
		.regex(/^[\p{L}\p{N}._-]+$/u, 'Логин содержит недопустимые символы.'),
	password: z.string()
		.min(12, 'Пароль должен содержать не менее 12 символов.')
		.max(256, 'Пароль слишком длинный.'),
	returnTo: z.string().max(2_048).optional()
});

/**
 * Password sign-in request accepted by the server adapter.
 */
export type PasswordSignInInput = z.infer<typeof passwordSignInInputSchema>;

/**
 * Password sign-in failure reason accepted by the UI.
 */
export type PasswordSignInErrorCode = (typeof passwordSignInErrorCodes)[number];

/**
 * Validates the serializable result returned to the browser.
 */
export const passwordSignInResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		redirectTo: z.string()
	}),
	z.object({
		ok: z.literal(false),
		errorCode: z.enum(passwordSignInErrorCodes),
		message: z.string(),
		fieldErrors: z.record(z.string(), z.string()).optional()
	})
]);

/**
 * Serializable password sign-in result consumed by the form.
 */
export type PasswordSignInResult = z.infer<typeof passwordSignInResultSchema>;
