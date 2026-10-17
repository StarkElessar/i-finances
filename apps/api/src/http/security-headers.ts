import type { MiddlewareHandler } from 'hono';

import type { ApiEnvironment } from './types';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'permissions-policy': 'camera=(), microphone=(), geolocation=()',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY'
};

function applyHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(name, value);
	}
}

/**
 * Adds the baseline security headers to every response of the API, including 404s, handled errors and
 * responses built by hand as `new Response(...)`. No Content-Security-Policy on purpose: the API serves no documents.
 */
export function securityHeaders(): MiddlewareHandler<ApiEnvironment> {
	return async (context, next) => {
		await next();

		try {
			applyHeaders(context.res.headers);
		}
		catch (error: unknown) {
			// `Response.redirect()` and responses proxied from `fetch()` have immutable headers: copy into a mutable one.
			if (!(error instanceof TypeError)) {
				throw error;
			}

			context.res = new Response(context.res.body, context.res);
			applyHeaders(context.res.headers);
		}
	};
}
