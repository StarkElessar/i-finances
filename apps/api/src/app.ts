import { Hono } from 'hono';

import type { CategoryHttpController } from './http/category-controller';
import { HealthController } from './http/health-controller';
import type { ApiEnvironment } from './http/types';

export type ApiAppDependencies = {
	categoryController?: CategoryHttpController;
};

export function createApiApp(
	dependencies: ApiAppDependencies = {}
): Hono<ApiEnvironment> {
	const app = new Hono<ApiEnvironment>();
	const healthController = new HealthController();

	app.get('/api/health', healthController.get());

	if (dependencies.categoryController !== undefined) {
		const categoryController = dependencies.categoryController;

		app.get('/api/categories', categoryController.list());
		app.post('/api/categories', categoryController.create());
		app.put('/api/categories/:id', categoryController.update());
		app.post('/api/categories/:id/archive', categoryController.archive());
		app.post('/api/categories/:id/restore', categoryController.restore());
		app.get('/api/public/categories', categoryController.publicList());
		app.options('/api/public/categories', categoryController.publicOptions());
	}

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
