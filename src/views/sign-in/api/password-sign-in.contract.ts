import { z } from 'zod';

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
 * Validates the serializable result returned to the browser.
 */
export const passwordSignInResultSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        redirectTo: z.string()
    }),
    z.object({
        ok: z.literal(false),
        message: z.string(),
        fieldErrors: z.record(z.string(), z.string()).optional()
    })
]);

/**
 * Serializable password sign-in result consumed by the form.
 */
export type PasswordSignInResult = z.infer<typeof passwordSignInResultSchema>;
