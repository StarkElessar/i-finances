import { z } from 'zod';

/**
 * Stable client-facing failure reasons for passkey sign-in.
 */
export const passkeySignInErrorCodes = [
    'not-supported',
    'cancelled',
    'invalid-input',
    'invalid-credentials',
    'invalid-origin',
    'unexpected'
] as const;

/**
 * User-facing passkey sign-in messages.
 */
export const passkeySignInErrorMessageByCode: Record<PasskeySignInErrorCode, string> = {
    'not-supported': 'Этот браузер не поддерживает вход с ключом доступа.',
    cancelled: 'Вход с ключом доступа отменён.',
    'invalid-input': 'Не удалось прочитать ответ ключа доступа.',
    'invalid-credentials': 'Ключ доступа не найден или больше недействителен.',
    'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
    unexpected: 'Не удалось войти с ключом доступа. Попробуйте ещё раз.'
};

/**
 * Passkey sign-in failure reason accepted by the UI.
 */
export type PasskeySignInErrorCode = (typeof passkeySignInErrorCodes)[number];

/**
 * Minimal WebAuthn authentication response envelope passed back to the server.
 */
export const passkeyAuthenticationResponseSchema = z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    response: z.object({
        clientDataJSON: z.string().min(1),
        authenticatorData: z.string().min(1),
        signature: z.string().min(1),
        userHandle: z.string().optional()
    }).loose(),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    authenticatorAttachment: z.string().optional()
}).loose();

/**
 * Validates the passkey sign-in verification request body.
 */
export const passkeySignInVerificationInputSchema = z.object({
    response: passkeyAuthenticationResponseSchema,
    returnTo: z.string().max(2_048).optional()
});

/**
 * Passkey sign-in verification request accepted by the server adapter.
 */
export type PasskeySignInVerificationInput = z.infer<typeof passkeySignInVerificationInputSchema>;

/**
 * Validates the serializable result returned to the browser.
 */
export const passkeySignInResultSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        redirectTo: z.string()
    }),
    z.object({
        ok: z.literal(false),
        errorCode: z.enum(passkeySignInErrorCodes),
        message: z.string()
    })
]);

/**
 * Serializable passkey sign-in result consumed by the form.
 */
export type PasskeySignInResult = z.infer<typeof passkeySignInResultSchema>;
