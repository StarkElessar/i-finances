import { z } from 'zod';

const authEnvironmentSchema = z.object({
	SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('i_finances_session'),
	SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
	AUTH_ORIGIN: z.url().default('http://localhost:5173'),
	TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(10).default(0),
	WEBAUTHN_RP_ID: z.string().trim().min(1).default('localhost'),
	WEBAUTHN_RP_NAME: z.string().trim().min(1).default('iFinances')
});

export type AuthConfig = {
	origin: string;
	sessionCookieName: string;
	sessionTtlMilliseconds: number;
	trustedProxyCount: number;
	webauthnRpId: string;
	webauthnRpName: string;
};

/**
 * Behind a proxy the safe default 0 makes every client look like the proxy, so a stranger can lock password sign-in
 * for everyone. Production must therefore state the number of proxies itself; the API refuses to start otherwise.
 */
function assertTrustedProxyCountIsExplicit(environment: NodeJS.ProcessEnv): void {
	if (environment.NODE_ENV === 'production' && (environment.TRUSTED_PROXY_COUNT ?? '').trim() === '') {
		throw new Error(
			'TRUSTED_PROXY_COUNT must be set explicitly in production: 1 behind the homelab nginx, 0 only when clients '
			+ 'connect to the API directly. See development/decisions/client-ip.md.'
		);
	}
}

export function getAuthConfig(
	environment: NodeJS.ProcessEnv = process.env
): AuthConfig {
	assertTrustedProxyCountIsExplicit(environment);

	const parsedEnvironment = authEnvironmentSchema.parse(environment);

	return {
		origin: parsedEnvironment.AUTH_ORIGIN,
		sessionCookieName: parsedEnvironment.SESSION_COOKIE_NAME,
		sessionTtlMilliseconds: parsedEnvironment.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
		trustedProxyCount: parsedEnvironment.TRUSTED_PROXY_COUNT,
		webauthnRpId: parsedEnvironment.WEBAUTHN_RP_ID,
		webauthnRpName: parsedEnvironment.WEBAUTHN_RP_NAME
	};
}
