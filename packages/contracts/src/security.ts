import { z } from 'zod';

/**
 * Contracts of the «Безопасность» section: the signed-in user's own passkeys,
 * browser sessions and password. Every record here belongs to the caller; the
 * API never accepts a user id from the client.
 */

export const securityErrorCodes = [
	'unauthenticated',
	'invalid-origin',
	'invalid-input',
	'not-found',
	'last-passkey',
	'current-session',
	'invalid-current-password',
	'password-unchanged',
	'rate-limited',
	'unexpected'
] as const;

export type SecurityErrorCode = (typeof securityErrorCodes)[number];

export const securityErrorMessageByCode: Record<SecurityErrorCode, string> = {
	unauthenticated: 'Требуется войти в приложение.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'invalid-input': 'Проверьте поля формы.',
	'not-found': 'Запись не найдена.',
	'last-passkey': 'Это последний способ входа. Сначала добавьте другой ключ доступа.',
	'current-session': 'Это текущий сеанс. Чтобы завершить его, выйдите из приложения.',
	'invalid-current-password': 'Текущий пароль указан неверно.',
	'password-unchanged': 'Новый пароль совпадает с текущим.',
	'rate-limited': 'Слишком много попыток. Попробуйте позже.',
	unexpected: 'Не удалось выполнить действие. Попробуйте ещё раз.'
};

export const securityFailureSchema = z.object({
	errorCode: z.enum(securityErrorCodes),
	fieldErrors: z.record(z.string(), z.string()).optional(),
	message: z.string(),
	ok: z.literal(false)
});

export type SecurityFailure = z.infer<typeof securityFailureSchema>;

const securityDateSchema = z.string().min(1);

export const securityPasskeySchema = z.object({
	createdAt: securityDateSchema,
	deviceName: z.string().nullable(),
	id: z.string().min(1),
	lastUsedAt: securityDateSchema.nullable()
});

export type SecurityPasskey = z.infer<typeof securityPasskeySchema>;

export const securityPasskeysResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		passkeys: z.array(securityPasskeySchema)
	}),
	securityFailureSchema
]);

export type SecurityPasskeysResult = z.infer<typeof securityPasskeysResultSchema>;

export const deleteSecurityPasskeyResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	securityFailureSchema
]);

export type DeleteSecurityPasskeyResult = z.infer<typeof deleteSecurityPasskeyResultSchema>;

export const changePasswordInputSchema = z.object({
	currentPassword: z.string()
		.min(1, 'Введите текущий пароль.')
		.max(256, 'Пароль слишком длинный.'),
	newPassword: z.string()
		.min(12, 'Пароль должен содержать не менее 12 символов.')
		.max(256, 'Пароль слишком длинный.')
});

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const changePasswordResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		revokedSessionCount: z.number().int().nonnegative()
	}),
	securityFailureSchema
]);

export type ChangePasswordResult = z.infer<typeof changePasswordResultSchema>;

export const securitySessionSchema = z.object({
	/** Browser name parsed from the user agent, `null` when unknown. */
	browser: z.string().nullable(),
	createdAt: securityDateSchema,
	expiresAt: securityDateSchema,
	id: z.string().min(1),
	ipAddress: z.string().nullable(),
	isCurrent: z.boolean(),
	lastSeenAt: securityDateSchema,
	/** Operating system parsed from the user agent, `null` when unknown. */
	os: z.string().nullable(),
	userAgent: z.string().nullable()
});

export type SecuritySession = z.infer<typeof securitySessionSchema>;

export const securitySessionsResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		sessions: z.array(securitySessionSchema)
	}),
	securityFailureSchema
]);

export type SecuritySessionsResult = z.infer<typeof securitySessionsResultSchema>;

export const revokeSecuritySessionResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	securityFailureSchema
]);

export type RevokeSecuritySessionResult = z.infer<typeof revokeSecuritySessionResultSchema>;

export const revokeOtherSecuritySessionsResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		revokedSessionCount: z.number().int().nonnegative()
	}),
	securityFailureSchema
]);

export type RevokeOtherSecuritySessionsResult = z.infer<typeof revokeOtherSecuritySessionsResultSchema>;
