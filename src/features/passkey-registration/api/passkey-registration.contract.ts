import { z } from 'zod';

/**
 * Validates the serializable passkey registration result returned to the browser.
 */
export const passkeyRegistrationResultSchema = z.object({
    ok: z.boolean(),
    message: z.string().optional()
});

/**
 * Client-facing passkey registration result.
 */
export type PasskeyRegistrationResult = z.infer<typeof passkeyRegistrationResultSchema>;
