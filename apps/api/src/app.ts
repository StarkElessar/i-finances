import { Hono } from 'hono';

import { HealthController } from './http/health-controller';
import type { ApiEnvironment } from './http/types';

export function createApiApp(): Hono<ApiEnvironment> {
	const app = new Hono<ApiEnvironment>();
	const healthController = new HealthController();

	app.get('/api/health', healthController.get());

	app.notFound((context) => context.json({
		error: {
			code: 'not_found',
			message: 'The requested resource was not found.'
		},
		ok: false
	}, 404));

	app.onError((error, context) => {
		console.error(error);

		return context.json({
			error: {
				code: 'internal_error',
				message: 'An unexpected error occurred.'
			},
			ok: false
		}, 500);
	});

	return app;
}
