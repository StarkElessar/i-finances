import type { AccountHttpController } from '@/http/account-controller';
import type { AuthHttpController } from '@/http/auth-controller';
import type { CategoryHttpController } from '@/http/category-controller';
import type { ContactHttpController } from '@/http/contact-controller';
import { HealthController } from '@/http/health-controller';
import type { OperationHttpController } from '@/http/operation-controller';
import type { PasskeyHttpController } from '@/http/passkey-controller';
import type { ReceiptImportHttpController } from '@/http/receipt-import-controller';
import type { ReceiptWorkerHttpController } from '@/http/receipt-worker-controller';
import type { ApiEnvironment } from '@/http/types';

import { Hono } from 'hono';

export type ApiAppDependencies = {
	accountController?: AccountHttpController;
	authController?: AuthHttpController;
	categoryController?: CategoryHttpController;
	contactController?: ContactHttpController;
	operationController?: OperationHttpController;
	passkeyController?: PasskeyHttpController;
	receiptImportController?: ReceiptImportHttpController;
	receiptWorkerController?: ReceiptWorkerHttpController;
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

	if (dependencies.accountController !== undefined) {
		const accountController = dependencies.accountController;

		app.get('/api/accounts', accountController.list());
		app.post('/api/accounts', accountController.create());
		app.put('/api/accounts/:id', accountController.update());
		app.post('/api/accounts/:id/archive', accountController.archive());
		app.post('/api/accounts/:id/restore', accountController.restore());
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

	if (dependencies.contactController !== undefined) {
		const contactController = dependencies.contactController;

		app.get('/api/contacts', contactController.list());
		app.post('/api/contacts', contactController.create());
		app.put('/api/contacts/:id', contactController.update());
		app.post('/api/contacts/:id/archive', contactController.archive());
		app.post('/api/contacts/:id/restore', contactController.restore());
	}

	if (dependencies.operationController !== undefined) {
		const operationController = dependencies.operationController;

		app.get('/api/operations/balances', operationController.balances());
		app.get('/api/operations/ledger', operationController.ledger());
		app.get('/api/operations/monthly-summary', operationController.monthlySummary());
		app.post('/api/operations', operationController.create());
		app.put('/api/operations/:id', operationController.update());
		app.post('/api/operations/:id/archive', operationController.archive());
		app.post('/api/operations/:id/restore', operationController.restore());
		app.post('/api/operations/:id/recalculate-rate', operationController.recalculateRate());
	}

	if (dependencies.receiptImportController !== undefined) {
		const receiptImportController = dependencies.receiptImportController;

		app.get('/api/receipt-imports', receiptImportController.list());
		app.post('/api/receipt-imports', receiptImportController.create());
		app.get('/api/receipt-imports/:id/image', receiptImportController.image());
		app.post('/api/receipt-imports/:id/revision', receiptImportController.requestRevision());
		app.put('/api/receipt-imports/:id/review', receiptImportController.updateReview());
		app.post('/api/receipt-imports/:id/approve', receiptImportController.approve());
	}

	if (dependencies.receiptWorkerController !== undefined) {
		const receiptWorkerController = dependencies.receiptWorkerController;

		app.post('/api/receipt-worker/jobs/lease', receiptWorkerController.lease());
		app.get('/api/receipt-worker/jobs/:id/image', receiptWorkerController.image());
		app.post('/api/receipt-worker/jobs/:id/heartbeat', receiptWorkerController.heartbeat());
		app.post('/api/receipt-worker/jobs/:id/complete', receiptWorkerController.complete());
		app.post('/api/receipt-worker/jobs/:id/fail', receiptWorkerController.fail());
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
