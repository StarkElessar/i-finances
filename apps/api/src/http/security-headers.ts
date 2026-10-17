import type { MiddlewareHandler } from 'hono';

import type { ApiEnvironment } from './types';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'permissions-policy': 'camera=(), microphone=(), geolocation=()',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY'
};

/**
 * Adds the baseline security headers to every response of the API, including 404s, handled errors and
 * responses built by hand as `new Response(...)`. No Content-Security-Policy on purpose: the API serves no documents.
 */
export function securityHeaders(): MiddlewareHandler<ApiEnvironment> {
	return async (context, next) => {
		await next();

		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			context.res.headers.set(name, value);
		}
	};
}
