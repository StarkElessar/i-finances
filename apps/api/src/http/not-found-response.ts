import type { Context } from 'hono';

/**
 * The answer to a route that does not exist. Also the answer of a route that must not admit it exists to the caller
 * (the platform administrator's routes, `app-invitation-controller.ts`): one function, so the two cannot drift apart.
 */
export function respondNotFound(context: Context): Response {
	return context.json({
		error: {
			code: 'not_found',
			message: 'The requested resource was not found.'
		},
		ok: false
	}, 404);
}
