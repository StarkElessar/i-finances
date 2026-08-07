import { z } from 'zod';

export const passwordSignInErrorCodes = [
	'invalid-input',
	'invalid-credentials',
	'rate-limited',
	'invalid-origin',
	'unexpected'
] as const;

export type PasswordSignInErrorCode = (typeof passwordSignInErrorCodes)[number];

export const passwordSignInErrorMessageByCode: Record<PasswordSignInErrorCode, string> = {
	'invalid-input': 'Проверьте поля формы.',
	'invalid-credentials': 'Не удалось войти. Проверьте логин и пароль.',
	'rate-limited': 'Слишком много попыток входа. Попробуйте позже.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	unexpected: 'Не удалось войти. Попробуйте ещё раз.'
};

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

export type PasswordSignInInput = z.infer<typeof passwordSignInInputSchema>;

export const passwordSignInResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		redirectTo: z.string()
	}),
	z.object({
		errorCode: z.enum(passwordSignInErrorCodes),
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type PasswordSignInResult = z.infer<typeof passwordSignInResultSchema>;

export const authSessionUserSchema = z.object({
	displayName: z.string(),
	id: z.string().min(1),
	username: z.string().min(1)
});

export const currentSessionResponseSchema = z.discriminatedUnion('authenticated', [
	z.object({
		authenticated: z.literal(true),
		user: authSessionUserSchema
	}),
	z.object({
		authenticated: z.literal(false)
	})
]);

export type CurrentSessionResponse = z.infer<typeof currentSessionResponseSchema>;

export const passwordSignOutResultSchema = z.object({
	ok: z.literal(true)
});

export type PasswordSignOutResult = z.infer<typeof passwordSignOutResultSchema>;
