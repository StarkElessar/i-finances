import { Hono } from 'hono';

import type { AuthHttpController } from './http/auth-controller';
import type { CategoryHttpController } from './http/category-controller';
import { HealthController } from './http/health-controller';
import type { PasskeyHttpController } from './http/passkey-controller';
import type { ApiEnvironment } from './http/types';

export type ApiAppDependencies = {
	authController?: AuthHttpController;
	categoryController?: CategoryHttpController;
	passkeyController?: PasskeyHttpController;
};

export function createApiApp(
	dependencies: ApiAppDependencies = {}
): Hono<ApiEnvironment> {
	const app = new Hono<ApiEnvironment>();
	const healthController = new HealthController();

	app.get('/api/health', healthController.get());

	if (dependencies.authController !== undefined) {
		const authController = dependencies.authController;

		app.get('/api/auth/session', authController.currentSession());
		app.post('/api/auth/sign-in', authController.signIn());
		app.post('/api/auth/sign-out', authController.signOut());
	}

	if (dependencies.passkeyController !== undefined) {
		const passkeyController = dependencies.passkeyController;

		app.post('/api/auth/passkey/sign-in/options', passkeyController.signInOptions());
		app.post('/api/auth/passkey/sign-in/verification', passkeyController.signInVerification());
		app.post('/api/auth/passkey/registration/options', passkeyController.registrationOptions());
		app.post('/api/auth/passkey/registration/verification', passkeyController.registrationVerification());
	}

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
