import type { AccountHttpController } from '@/http/account-controller';
import type { AppInvitationHttpController } from '@/http/app-invitation-controller';
import type { AuthHttpController } from '@/http/auth-controller';
import type { CategoryHttpController } from '@/http/category-controller';
import type { ContactHttpController } from '@/http/contact-controller';
import type { ExchangeRateHttpController } from '@/http/exchange-rate-controller';
import { HealthController } from '@/http/health-controller';
import type { HouseholdHttpController } from '@/http/household-controller';
import type { HouseholdInvitationHttpController } from '@/http/household-invitation-controller';
import { respondToHouseholdAccessError } from '@/http/household-required-response';
import { respondNotFound } from '@/http/not-found-response';
import type { OperationHttpController } from '@/http/operation-controller';
import type { PasskeyHttpController } from '@/http/passkey-controller';
import type { ReceiptImportHttpController } from '@/http/receipt-import-controller';
import type { SecurityHttpController } from '@/http/security-controller';
import { securityHeaders } from '@/http/security-headers';
import type { TelegramAuthHttpController } from '@/http/telegram-auth-controller';
import type { TelegramDevLoginHttpController } from '@/http/telegram-dev-login-controller';
import type { TelegramLinkHttpController } from '@/http/telegram-link-controller';
import type { TelegramWebhookHttpController } from '@/http/telegram-webhook-controller';
import type { TransferHttpController } from '@/http/transfer-controller';
import type { ApiEnvironment } from '@/http/types';

import { Hono } from 'hono';

export type ApiAppDependencies = {
	accountController?: AccountHttpController;
	appInvitationController?: AppInvitationHttpController;
	authController?: AuthHttpController;
	categoryController?: CategoryHttpController;
	contactController?: ContactHttpController;
	exchangeRateController?: ExchangeRateHttpController;
	householdController?: HouseholdHttpController;
	householdInvitationController?: HouseholdInvitationHttpController;
	operationController?: OperationHttpController;
	passkeyController?: PasskeyHttpController;
	receiptImportController?: ReceiptImportHttpController;
	securityController?: SecurityHttpController;
	telegramAuthController?: TelegramAuthHttpController;
	/** Present only with `DEV_TELEGRAM_LOGIN=true`, which production refuses. */
	telegramDevLoginController?: TelegramDevLoginHttpController;
	telegramLinkController?: TelegramLinkHttpController;
	telegramWebhookController?: TelegramWebhookHttpController;
	transferController?: TransferHttpController;
};

export function createApiApp(
	dependencies: ApiAppDependencies = {}
): Hono<ApiEnvironment> {
	const app = new Hono<ApiEnvironment>();
	const healthController = new HealthController();

	app.use('*', securityHeaders());

	app.get('/api/health', healthController.get());

	if (dependencies.authController !== undefined) {
		const authController = dependencies.authController;

		app.get('/api/auth/session', authController.currentSession());
		app.post('/api/auth/sign-in', authController.signIn());
		app.post('/api/auth/sign-out', authController.signOut());
		app.put('/api/auth/display-name', authController.updateDisplayName());
	}

	if (dependencies.telegramAuthController !== undefined) {
		const telegramAuthController = dependencies.telegramAuthController;

		app.post('/api/auth/telegram/start', telegramAuthController.bodyLimit(), telegramAuthController.start());
		app.post('/api/auth/telegram/complete', telegramAuthController.bodyLimit(), telegramAuthController.complete());
		app.post('/api/auth/telegram/cancel', telegramAuthController.bodyLimit(), telegramAuthController.cancel());
	}

	if (dependencies.telegramDevLoginController !== undefined) {
		const telegramDevLoginController = dependencies.telegramDevLoginController;

		app.post(
			'/api/dev/telegram/confirm',
			telegramDevLoginController.loopbackOnly(),
			telegramDevLoginController.bodyLimit(),
			telegramDevLoginController.confirm()
		);
	}

	if (dependencies.telegramLinkController !== undefined) {
		const telegramLinkController = dependencies.telegramLinkController;

		// Under /api/auth/telegram, so the request cookie (`Path=/api/auth/telegram`) reaches them.
		app.post('/api/auth/telegram/link/start', telegramLinkController.bodyLimit(), telegramLinkController.start());
		app.post('/api/auth/telegram/link/complete', telegramLinkController.bodyLimit(), telegramLinkController.complete());
	}

	if (dependencies.accountController !== undefined) {
		const accountController = dependencies.accountController;

		app.get('/api/accounts', accountController.list());
		app.get('/api/accounts/:id', accountController.get());
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

	if (dependencies.securityController !== undefined) {
		const securityController = dependencies.securityController;

		app.get('/api/security/passkeys', securityController.listPasskeys());
		app.delete('/api/security/passkeys/:id', securityController.deletePasskey());
		app.post('/api/security/password', securityController.changePasswordBodyLimit(), securityController.changePassword());
		app.get('/api/security/sessions', securityController.listSessions());
		// Registered before `:id` so that `others` is never read as a session id.
		app.delete('/api/security/sessions/others', securityController.revokeOtherSessions());
		app.delete('/api/security/sessions/:id', securityController.revokeSession());
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

	if (dependencies.exchangeRateController !== undefined) {
		app.get('/api/exchange-rates/current', dependencies.exchangeRateController.current());
	}

	if (dependencies.householdController !== undefined) {
		const householdController = dependencies.householdController;

		app.get('/api/household', householdController.get());
		app.post('/api/household', householdController.create());
		app.put('/api/household', householdController.update());
		app.post('/api/household/members/:userId/remove', householdController.removeMember());
		app.post('/api/household/leave', householdController.leave());
	}

	if (dependencies.householdInvitationController !== undefined) {
		const invitationController = dependencies.householdInvitationController;

		app.post('/api/household/invitations', invitationController.bodyLimit(), invitationController.create());
		app.get('/api/household/invitations', invitationController.list());
		app.post('/api/household/invitations/:id/revoke', invitationController.bodyLimit(), invitationController.revoke());
		// The token travels in the body, never in the path: paths end up in access logs (Р5).
		app.post('/api/invitations/preview', invitationController.bodyLimit(), invitationController.preview());
		app.post('/api/invitations/accept', invitationController.bodyLimit(), invitationController.accept());
	}

	if (dependencies.appInvitationController !== undefined) {
		const appInvitationController = dependencies.appInvitationController;

		// `adminOnly()` first, before the body limit: to anyone but a platform administrator these routes look like
		// routes that do not exist (app-invitations-v1.md).
		app.post(
			'/api/app-invitations',
			appInvitationController.adminOnly(),
			appInvitationController.bodyLimit(),
			appInvitationController.create()
		);
		app.get('/api/app-invitations', appInvitationController.adminOnly(), appInvitationController.list());
		app.post(
			'/api/app-invitations/:id/revoke',
			appInvitationController.adminOnly(),
			appInvitationController.bodyLimit(),
			appInvitationController.revoke()
		);
	}

	if (dependencies.operationController !== undefined) {
		const operationController = dependencies.operationController;

		app.get('/api/operations/balances', operationController.balances());
		app.get('/api/operations/ledger', operationController.ledger());
		app.get('/api/operations/by-category', operationController.categoryOperations());
		app.get('/api/operations/by-contact', operationController.contactOperations());
		app.get('/api/operations/monthly-summary', operationController.monthlySummary());
		app.get('/api/operations/category-stats', operationController.categoryStats());
		app.get('/api/operations/monthly-trend', operationController.monthlyTrend());
		app.get('/api/operations/monthly-breakdown', operationController.monthlyBreakdown());
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
		app.post('/api/receipt-imports/:id/retry', receiptImportController.retry());
		app.put('/api/receipt-imports/:id/review', receiptImportController.updateReview());
		app.post('/api/receipt-imports/:id/approve', receiptImportController.approve());
	}

	if (dependencies.transferController !== undefined) {
		const transferController = dependencies.transferController;

		app.get('/api/transfers/:id', transferController.get());
		app.post('/api/transfers', transferController.create());
		app.put('/api/transfers/:id', transferController.update());
		app.post('/api/transfers/:id/delete', transferController.delete());
	}

	if (dependencies.telegramWebhookController !== undefined) {
		const telegramWebhookController = dependencies.telegramWebhookController;

		// Called by Telegram, not by a browser: no session and no Origin check, the secret header is the credential.
		app.post(
			'/api/telegram/webhook',
			telegramWebhookController.verifySecret(),
			telegramWebhookController.bodyLimit(),
			telegramWebhookController.receive()
		);
	}

	app.notFound((context) => respondNotFound(context));

	app.onError((error, context) => {
		// The single mapping of «no household» for every household-scoped route (Р8): controllers let it through.
		const householdRequired = respondToHouseholdAccessError(context, error);

		if (householdRequired !== undefined) {
			return householdRequired;
		}

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
