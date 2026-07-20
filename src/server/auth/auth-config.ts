import { z } from 'zod';

const authEnvironmentSchema = z.object({
    SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('i_finances_session'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUTH_ORIGIN: z.url().default('http://localhost:5173'),
    WEBAUTHN_RP_ID: z.string().trim().min(1).default('localhost'),
    WEBAUTHN_RP_NAME: z.string().trim().min(1).default('iFinances')
});

/**
 * Validated server-side authentication configuration.
 */
export type AuthConfig = {
    sessionCookieName: string;
    sessionTtlMilliseconds: number;
    origin: string;
    webauthnRpId: string;
    webauthnRpName: string;
};

/**
 * Reads and validates authentication-related environment variables.
 */
export function getAuthConfig(): AuthConfig {
    const environment = authEnvironmentSchema.parse(process.env);

    return {
        sessionCookieName: environment.SESSION_COOKIE_NAME,
        sessionTtlMilliseconds: environment.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        origin: environment.AUTH_ORIGIN,
        webauthnRpId: environment.WEBAUTHN_RP_ID,
        webauthnRpName: environment.WEBAUTHN_RP_NAME
    };
}
