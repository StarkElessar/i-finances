import { AccountHttpController } from './http/account-controller';
import { ApiKeySessionResolver } from './http/api-key-session-resolver';
import { AuthHttpController } from './http/auth-controller';
import { CategoryHttpController } from './http/category-controller';
import { CompositeSessionResolver } from './http/composite-session-resolver';
import { ContactHttpController } from './http/contact-controller';
import { ExchangeRateHttpController } from './http/exchange-rate-controller';
import { HouseholdHttpController } from './http/household-controller';
import { HouseholdInvitationHttpController } from './http/household-invitation-controller';
import { OperationHttpController } from './http/operation-controller';
import { PasskeyHttpController } from './http/passkey-controller';
import { ReceiptImportHttpController } from './http/receipt-import-controller';
import { SecurityHttpController } from './http/security-controller';
import { CookieSessionResolver } from './http/session-resolver';
import { TelegramAuthHttpController } from './http/telegram-auth-controller';
import { TelegramDevLoginHttpController } from './http/telegram-dev-login-controller';
import { TelegramLinkHttpController } from './http/telegram-link-controller';
import { TelegramWebhookHttpController } from './http/telegram-webhook-controller';
import { TransferHttpController } from './http/transfer-controller';
import { type AppDatabase, db } from './infrastructure/database/client';
import {
	AccountRepository,
	AccountService
} from './modules/account';
import {
	FixedWindowRateLimiter,
	getAuthConfig,
	LoginRateLimiter,
	PasswordService,
	PasswordSignInService,
	PasswordUserRepository,
	SecurityService,
	SessionRepository,
	SessionService,
	SignInMethodsRepository,
	WebAuthnChallengeRepository,
	WebAuthnCredentialRepository,
	WebAuthnService
} from './modules/auth';
import {
	CategoryRepository,
	CategoryService
} from './modules/category';
import {
	ContactRepository,
	ContactService
} from './modules/contact';
import {
	ExchangeRateRepository,
	ExchangeRateService,
	NationalBankExchangeRateClient
} from './modules/exchange-rate';
import {
	getHouseholdInvitationConfig,
	HouseholdInvitationRepository,
	HouseholdInvitationService,
	HouseholdMembershipRepository,
	HouseholdRepository,
	HouseholdResolver,
	HouseholdService
} from './modules/household';
import {
	OperationRepository,
	OperationService
} from './modules/operation';
import {
	createLiteLlmClient,
	createReceiptImageStorage,
	createReceiptImportRepository,
	ReceiptImportService,
	type ReceiptProcessingLoop,
	startReceiptProcessingLoop
} from './modules/receipt-import';
import {
	FetchTelegramBotClient,
	getTelegramConfig,
	loadTelegramMessages,
	ProcessedUpdateIds,
	type TelegramBotClient,
	type TelegramConfig,
	type TelegramMessages,
	TelegramUpdateDispatcher,
	TelegramUpdatesRunner
} from './modules/telegram';
import {
	TelegramAccountRepository,
	TelegramLinkRepository,
	TelegramLinkService,
	TelegramLoginRequestRepository,
	TelegramSignInService
} from './modules/telegram-auth';
import {
	createTransferRepository,
	createTransferService
} from './modules/transfer';
import type { ApiAppDependencies } from './app';

/**
 * The production object graph built by `createApiDependencies`.
 */
export type ApiDependencies = {
	authController: AuthHttpController;
	accountController: AccountHttpController;
	categoryController: CategoryHttpController;
	contactController: ContactHttpController;
	exchangeRateController: ExchangeRateHttpController;
	householdController: HouseholdHttpController;
	householdInvitationController: HouseholdInvitationHttpController;
	operationController: OperationHttpController;
	passkeyController: PasskeyHttpController;
	receiptImportController: ReceiptImportHttpController;
	receiptImportService: ReceiptImportService;
	securityController: SecurityHttpController;
	startReceiptProcessing: () => Promise<ReceiptProcessingLoop | undefined>;
	telegram: {
		/** Undefined while no bot token is configured. */
		botClient: TelegramBotClient | undefined;
		config: TelegramConfig;
		/** `main.ts` drains it at shutdown, so handlers still running are not cut off. */
		dispatcher: TelegramUpdateDispatcher;
		/** Present only with `DEV_TELEGRAM_LOGIN=true` (never in production). */
		devLoginController: TelegramDevLoginHttpController | undefined;
		/** `link/start` and `link/complete` (A4), on the browser cookie session only. */
		linkController: TelegramLinkHttpController;
		messages: TelegramMessages;
		signInController: TelegramAuthHttpController;
		signInService: TelegramSignInService;
		/** Present in `webhook` and `polling` modes; `start()` it after the server listens. */
		updatesRunner: TelegramUpdatesRunner | undefined;
		/** Present in `webhook` mode only; in the other modes the route does not exist. */
		webhookController: TelegramWebhookHttpController | undefined;
	};
	transferController: TransferHttpController;
};

/**
 * The controllers `createApiApp` registers, taken from the graph. `main.ts` and the route-coverage test of
 * `household-isolation-http.test.ts` both use it, so a route the server registers cannot be missing from the test.
 */
export function toApiAppDependencies(dependencies: ApiDependencies): ApiAppDependencies {
	return {
		...dependencies,
		telegramAuthController: dependencies.telegram.signInController,
		telegramDevLoginController: dependencies.telegram.devLoginController,
		telegramLinkController: dependencies.telegram.linkController,
		telegramWebhookController: dependencies.telegram.webhookController
	};
}

export type ApiDependenciesOptions = {
	/**
	 * The Bot API client. Defaults to the real `FetchTelegramBotClient` when `TELEGRAM_BOT_TOKEN` is set (none without
	 * a token); tests pass `FakeTelegramBotClient` so that nothing ever reaches Telegram.
	 */
	telegramBotClient?: TelegramBotClient;
};

const FIVE_MINUTES_MILLISECONDS = 5 * 60 * 1000;

/**
 * Builds the production object graph explicitly at the application boundary.
 *
 * `database` defaults to the configured shared connection; tests pass a fresh in-memory database so the real graph
 * runs per test (`household-isolation-http.test.ts`).
 */
export function createApiDependencies(database: AppDatabase = db, options: ApiDependenciesOptions = {}): ApiDependencies {
	const authConfig = getAuthConfig();
	// Throws, and so stops the start, when the Telegram environment is half configured (DEV_TELEGRAM_LOGIN in
	// production included) or the bot texts are broken.
	const telegramConfig = getTelegramConfig(process.env, authConfig.origin);
	const telegramMessages = loadTelegramMessages();
	const telegramBotClient = options.telegramBotClient ?? (telegramConfig.botToken === undefined
		? undefined
		: new FetchTelegramBotClient({ token: telegramConfig.botToken }));
	const signInMethods = new SignInMethodsRepository(database);
	const sessionRepository = new SessionRepository(database);
	const sessionService = new SessionService(sessionRepository, {
		config: authConfig
	});
	const passwordUserRepository = new PasswordUserRepository(database);
	// Browser cookie only. Controllers that manage credentials (passkeys, password, sessions)
	// must use this resolver: the MCP bearer key must not be able to mint a cookie session
	// for the key owner by registering its own passkey.
	const cookieSessionResolver = new CookieSessionResolver(sessionService, authConfig.sessionCookieName);
	const sessionResolver = new CompositeSessionResolver([
		cookieSessionResolver,
		new ApiKeySessionResolver(passwordUserRepository)
	]);
	const passwordService = new PasswordService();
	const passwordSignInService = new PasswordSignInService({
		passwordService,
		rateLimiter: new LoginRateLimiter(),
		sessionService,
		userRepository: passwordUserRepository
	});
	const webAuthnCredentialRepository = new WebAuthnCredentialRepository(database);
	const webAuthnService = new WebAuthnService({
		challengeRepository: new WebAuthnChallengeRepository(database),
		config: authConfig,
		credentialRepository: webAuthnCredentialRepository,
		sessionService,
		signInMethods
	});
	const securityService = new SecurityService({
		credentialRepository: webAuthnCredentialRepository,
		isTelegramSignInAvailable: telegramConfig.signInAvailable,
		passwordService,
		// This limiter is keyed by `unknown:<userId>` (no address) and must stay a plain per-user attempt counter. The
		// per-username and per-address ceilings of the sign-in form would add counters with different behavior.
		rateLimiter: new LoginRateLimiter({
			maxAttemptsPerIp: Number.POSITIVE_INFINITY,
			maxAttemptsPerUsername: Number.POSITIVE_INFINITY
		}),
		sessionRepository,
		signInMethods,
		userRepository: passwordUserRepository
	});
	const householdRepository = new HouseholdRepository(database);
	const householdResolver = new HouseholdResolver(householdRepository);
	// One pair of limiters for both flows (Р11 lists `start` with `link/start` and `complete` with `link/complete`): a
	// second flow must not double what one address may do.
	const telegramStartRateLimiter = new FixedWindowRateLimiter({ maxRequests: 10, windowMilliseconds: FIVE_MINUTES_MILLISECONDS });
	const telegramCompleteRateLimiter = new FixedWindowRateLimiter({ maxRequests: 300, windowMilliseconds: FIVE_MINUTES_MILLISECONDS });
	const telegramLoginRequests = new TelegramLoginRequestRepository(database);
	const telegramLinkService = new TelegramLinkService({
		completeRateLimiter: telegramCompleteRateLimiter,
		config: telegramConfig,
		links: new TelegramLinkRepository(database),
		messages: telegramMessages,
		requests: telegramLoginRequests,
		signInMethods,
		startRateLimiter: telegramStartRateLimiter
	});
	const telegramSignInService = new TelegramSignInService({
		accounts: new TelegramAccountRepository(database),
		botClient: telegramBotClient,
		completeRateLimiter: telegramCompleteRateLimiter,
		config: telegramConfig,
		households: householdResolver,
		link: telegramLinkService,
		messages: telegramMessages,
		requests: telegramLoginRequests,
		sessionService,
		startRateLimiter: telegramStartRateLimiter
	});
	const telegramDispatcher = new TelegramUpdateDispatcher(telegramSignInService, new ProcessedUpdateIds());
	const householdService = new HouseholdService({
		householdRepository,
		householdResolver,
		membershipRepository: new HouseholdMembershipRepository(database, sessionRepository)
	});
	const householdInvitationService = new HouseholdInvitationService({
		acceptRateLimiter: new FixedWindowRateLimiter({ maxRequests: 10, windowMilliseconds: FIVE_MINUTES_MILLISECONDS }),
		// Throws, and so stops the start, on a HOUSEHOLD_INVITATION_TTL_HOURS outside 1-168.
		config: getHouseholdInvitationConfig(process.env),
		householdResolver,
		invitations: new HouseholdInvitationRepository(database),
		origin: authConfig.origin,
		previewRateLimiter: new FixedWindowRateLimiter({ maxRequests: 30, windowMilliseconds: FIVE_MINUTES_MILLISECONDS })
	});
	const categoryService = new CategoryService({
		categoryRepository: new CategoryRepository(database),
		householdResolver
	});
	const contactService = new ContactService({
		contactRepository: new ContactRepository(database),
		householdResolver
	});
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database), {
		dailyRateProvider: new NationalBankExchangeRateClient()
	});
	const accountService = new AccountService({
		accountRepository: new AccountRepository(database),
		householdResolver
	});
	const operationService = new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository: new ContactRepository(database),
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		operationRepository: new OperationRepository(database)
	});
	const transferService = createTransferService({
		accountRepository: new AccountRepository(database),
		contactRepository: new ContactRepository(database),
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		transferRepository: createTransferRepository(database)
	});
	const configuredRetentionDays = Number(process.env.RECEIPT_IMAGE_RETENTION_DAYS);
	const receiptImportService = new ReceiptImportService({
		accountRepository: new AccountRepository(database),
		imageRetentionDays: Number.isInteger(configuredRetentionDays) && configuredRetentionDays > 0
			? configuredRetentionDays
			: undefined,
		categoryRepository: new CategoryRepository(database),
		contactRepository: new ContactRepository(database),
		householdResolver,
		imageStorage: createReceiptImageStorage(),
		operationService,
		receiptImportRepository: createReceiptImportRepository(database)
	});

	const startReceiptProcessing = async (): Promise<ReceiptProcessingLoop | undefined> => {
		const apiKey = process.env.RECEIPT_LITELLM_API_KEY;
		// `??` only covers an unset variable; an empty string (the documented ".env.example" style
		// for "unset") would turn into 0 — a no-delay poll loop and an instantly aborting timeout.
		const configuredTimeoutMs = Number(process.env.RECEIPT_PROCESSING_TIMEOUT_MS);
		const configuredPollIntervalMs = Number(process.env.RECEIPT_PROCESSING_POLL_INTERVAL_MS);

		if (!apiKey?.trim()) {
			console.warn('RECEIPT_LITELLM_API_KEY is not set; the receipt processing loop will not start.');
			return;
		}

		await receiptImportService.recoverStaleProcessingJobs();

		return startReceiptProcessingLoop({
			imageStorage: createReceiptImageStorage(),
			litellmClient: createLiteLlmClient({
				apiKey,
				baseUrl: process.env.RECEIPT_LITELLM_BASE_URL ?? 'https://litellm.holdingbp.ru:4000/v1',
				model: process.env.RECEIPT_LITELLM_MODEL ?? 'deepseek-flash',
				timeoutMs: Number.isInteger(configuredTimeoutMs) && configuredTimeoutMs > 0
					? configuredTimeoutMs
					: 120_000
			}),
			pollIntervalMs: Number.isInteger(configuredPollIntervalMs) && configuredPollIntervalMs > 0
				? configuredPollIntervalMs
				: 5_000,
			receiptImportService
		});
	};

	const telegramUpdatesRunner = telegramBotClient !== undefined && telegramConfig.updatesMode !== 'off'
		? new TelegramUpdatesRunner({
			botClient: telegramBotClient,
			dispatcher: telegramDispatcher,
			mode: telegramConfig.updatesMode,
			webhook: telegramConfig.webhookSecret !== undefined && telegramConfig.webhookUrl !== undefined
				? { secret: telegramConfig.webhookSecret, url: telegramConfig.webhookUrl }
				: undefined
		})
		: undefined;
	const telegramWebhookController = telegramConfig.updatesMode === 'webhook' && telegramConfig.webhookSecret !== undefined
		? new TelegramWebhookHttpController({ dispatcher: telegramDispatcher, secret: telegramConfig.webhookSecret })
		: undefined;

	return {
		authController: new AuthHttpController(
			passwordSignInService,
			sessionService,
			sessionResolver,
			passwordUserRepository,
			householdResolver,
			signInMethods,
			authConfig
		),
		accountController: new AccountHttpController(
			accountService,
			sessionResolver,
			authConfig
		),
		categoryController: new CategoryHttpController(
			categoryService,
			sessionResolver
		),
		contactController: new ContactHttpController(
			contactService,
			sessionResolver
		),
		exchangeRateController: new ExchangeRateHttpController(
			exchangeRateService,
			householdResolver,
			sessionResolver
		),
		// Browser cookie only, like the credential controllers: the MCP bearer key works with the finance data of
		// MCP_USER_ID, but must not manage the household or its membership (create, rename, and later invite,
		// remove, leave). A leaked key must not be able to invite someone into the family finances.
		householdController: new HouseholdHttpController(
			householdService,
			cookieSessionResolver,
			authConfig
		),
		// Browser cookie only, for the same reason: inviting and accepting are membership management.
		householdInvitationController: new HouseholdInvitationHttpController(
			householdInvitationService,
			cookieSessionResolver,
			authConfig
		),
		operationController: new OperationHttpController(
			operationService,
			sessionResolver
		),
		receiptImportController: new ReceiptImportHttpController(
			receiptImportService,
			sessionResolver,
			authConfig
		),
		receiptImportService,
		securityController: new SecurityHttpController(
			securityService,
			cookieSessionResolver,
			authConfig
		),
		startReceiptProcessing,
		telegram: {
			botClient: telegramBotClient,
			config: telegramConfig,
			devLoginController: telegramConfig.devLoginEnabled
				? new TelegramDevLoginHttpController(telegramSignInService, authConfig)
				: undefined,
			dispatcher: telegramDispatcher,
			// Browser cookie only: a leaked MCP key must not attach a Telegram (a new way in) to its user.
			linkController: new TelegramLinkHttpController(telegramLinkService, cookieSessionResolver, authConfig),
			messages: telegramMessages,
			signInController: new TelegramAuthHttpController(telegramSignInService, authConfig),
			signInService: telegramSignInService,
			updatesRunner: telegramUpdatesRunner,
			webhookController: telegramWebhookController
		},
		transferController: new TransferHttpController(
			transferService,
			sessionResolver
		),
		passkeyController: new PasskeyHttpController(
			webAuthnService,
			cookieSessionResolver,
			authConfig
		)
	};
}
