import { z } from 'zod';

const passkeyCredentialDescriptorSchema = z.object({
	id: z.string().min(1),
	transports: z.array(z.string()).optional(),
	type: z.literal('public-key')
}).loose();

export const passkeyAuthenticationOptionsSchema = z.object({
	allowCredentials: z.array(passkeyCredentialDescriptorSchema).optional(),
	challenge: z.string().min(1),
	rpId: z.string().min(1).optional(),
	timeout: z.number().int().positive().optional(),
	userVerification: z.enum(['discouraged', 'preferred', 'required']).optional()
}).loose();

export type PasskeyAuthenticationOptions = z.infer<typeof passkeyAuthenticationOptionsSchema>;

export const passkeyRegistrationOptionsSchema = z.object({
	challenge: z.string().min(1),
	pubKeyCredParams: z.array(z.object({
		alg: z.number().int(),
		type: z.literal('public-key')
	}).loose()).min(1),
	rp: z.object({
		id: z.string().min(1).optional(),
		name: z.string().min(1)
	}).loose(),
	user: z.object({
		displayName: z.string().min(1),
		id: z.string().min(1),
		name: z.string().min(1)
	}).loose()
}).loose();

export type PasskeyRegistrationOptions = z.infer<typeof passkeyRegistrationOptionsSchema>;

export const passkeyAuthenticationResponseSchema = z.object({
	authenticatorAttachment: z.string().optional(),
	clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
	id: z.string().min(1),
	rawId: z.string().min(1),
	response: z.object({
		authenticatorData: z.string().min(1),
		clientDataJSON: z.string().min(1),
		signature: z.string().min(1),
		userHandle: z.string().optional()
	}).loose(),
	type: z.literal('public-key')
}).loose();

export type PasskeyAuthenticationResponse = z.infer<typeof passkeyAuthenticationResponseSchema>;

export const passkeySignInVerificationInputSchema = z.object({
	response: passkeyAuthenticationResponseSchema,
	returnTo: z.string().max(2_048).optional()
});

export type PasskeySignInVerificationInput = z.infer<typeof passkeySignInVerificationInputSchema>;

export const passkeySignInErrorCodes = [
	'not-supported',
	'cancelled',
	'invalid-input',
	'invalid-credentials',
	'invalid-origin',
	'unexpected'
] as const;

export type PasskeySignInErrorCode = (typeof passkeySignInErrorCodes)[number];

export const passkeySignInErrorMessageByCode: Record<PasskeySignInErrorCode, string> = {
	'not-supported': 'Этот браузер не поддерживает вход с ключом доступа.',
	cancelled: 'Вход с ключом доступа отменён.',
	'invalid-input': 'Не удалось прочитать ответ ключа доступа.',
	'invalid-credentials': 'Ключ доступа не найден или больше недействителен.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	unexpected: 'Не удалось войти с ключом доступа. Попробуйте ещё раз.'
};

export const passkeySignInResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		redirectTo: z.string()
	}),
	z.object({
		errorCode: z.enum(passkeySignInErrorCodes),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type PasskeySignInResult = z.infer<typeof passkeySignInResultSchema>;

export const passkeyRegistrationResponseSchema = z.object({
	authenticatorAttachment: z.string().optional(),
	clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
	id: z.string().min(1),
	rawId: z.string().min(1),
	response: z.object({
		attestationObject: z.string().min(1),
		clientDataJSON: z.string().min(1),
		transports: z.array(z.string()).optional()
	}).loose(),
	type: z.literal('public-key')
}).loose();

export type PasskeyRegistrationResponse = z.infer<typeof passkeyRegistrationResponseSchema>;

export const passkeyRegistrationVerificationInputSchema = z.object({
	deviceName: z.string().trim().max(100).optional(),
	response: passkeyRegistrationResponseSchema
});

export type PasskeyRegistrationVerificationInput = z.infer<typeof passkeyRegistrationVerificationInputSchema>;

export const passkeyRegistrationErrorCodes = [
	'authentication-required',
	'invalid-input',
	'invalid-origin',
	'verification-failed',
	'unexpected'
] as const;

export type PasskeyRegistrationErrorCode = (typeof passkeyRegistrationErrorCodes)[number];

export const passkeyRegistrationErrorMessageByCode: Record<PasskeyRegistrationErrorCode, string> = {
	'authentication-required': 'Требуется авторизация.',
	'invalid-input': 'Не удалось прочитать ответ ключа доступа.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'verification-failed': 'Не удалось сохранить ключ доступа.',
	unexpected: 'Не удалось добавить ключ доступа. Попробуйте ещё раз.'
};

export const passkeyRegistrationResultSchema = z.discriminatedUnion('ok', [
	z.object({
		message: z.string().optional(),
		ok: z.literal(true)
	}),
	z.object({
		errorCode: z.enum(passkeyRegistrationErrorCodes),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type PasskeyRegistrationResult = z.infer<typeof passkeyRegistrationResultSchema>;
