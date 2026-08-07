import { z } from 'zod';

const authEnvironmentSchema = z.object({
	SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('i_finances_session'),
	SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
	AUTH_ORIGIN: z.url().default('http://localhost:5173'),
	WEBAUTHN_RP_ID: z.string().trim().min(1).default('localhost'),
	WEBAUTHN_RP_NAME: z.string().trim().min(1).default('iFinances')
});

export type AuthConfig = {
	origin: string;
	sessionCookieName: string;
	sessionTtlMilliseconds: number;
	webauthnRpId: string;
	webauthnRpName: string;
};

export function getAuthConfig(
	environment: NodeJS.ProcessEnv = process.env
): AuthConfig {
	const parsedEnvironment = authEnvironmentSchema.parse(environment);

	return {
		origin: parsedEnvironment.AUTH_ORIGIN,
		sessionCookieName: parsedEnvironment.SESSION_COOKIE_NAME,
		sessionTtlMilliseconds: parsedEnvironment.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
		webauthnRpId: parsedEnvironment.WEBAUTHN_RP_ID,
		webauthnRpName: parsedEnvironment.WEBAUTHN_RP_NAME
	};
}
