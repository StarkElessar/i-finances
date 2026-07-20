import { z } from 'zod';

/**
 * Minimal WebAuthn registration response envelope passed back to the server.
 */
export const passkeyRegistrationResponseSchema = z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    response: z.object({
        clientDataJSON: z.string().min(1),
        attestationObject: z.string().min(1),
        transports: z.array(z.string()).optional()
    }).loose(),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    authenticatorAttachment: z.string().optional()
}).loose();

/**
 * Validates a passkey enrollment verification request body.
 */
export const passkeyRegistrationVerificationInputSchema = z.object({
    response: passkeyRegistrationResponseSchema,
    deviceName: z.string().trim().max(100).optional()
});

/**
 * Passkey enrollment verification request accepted by server adapters.
 */
export type PasskeyRegistrationVerificationInput = z.infer<typeof passkeyRegistrationVerificationInputSchema>;
