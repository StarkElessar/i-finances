import { AccountHttpController } from './http/account-controller';
import { ApiKeySessionResolver } from './http/api-key-session-resolver';
import { AuthHttpController } from './http/auth-controller';
import { CategoryHttpController } from './http/category-controller';
import { CompositeSessionResolver } from './http/composite-session-resolver';
import { ContactHttpController } from './http/contact-controller';
import { ExchangeRateHttpController } from './http/exchange-rate-controller';
import { OperationHttpController } from './http/operation-controller';
import { PasskeyHttpController } from './http/passkey-controller';
import { ReceiptImportHttpController } from './http/receipt-import-controller';
import { SecurityHttpController } from './http/security-controller';
import { CookieSessionResolver } from './http/session-resolver';
import { TelegramWebhookHttpController } from './http/telegram-webhook-controller';
import { TransferHttpController } from './http/transfer-controller';
import { db } from './infrastructure/database/client';
import {
	AccountRepository,
	AccountService
} from './modules/account';
import {
	getAuthConfig,
	LoginRateLimiter,
	PasswordService,
	PasswordSignInService,
	PasswordUserRepository,
	SecurityService,
	SessionRepository,
	SessionService,
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
	HouseholdRepository,
	HouseholdResolver
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
	IgnoringTelegramUpdateHandler,
	loadTelegramMessages,
	ProcessedUpdateIds,
	type TelegramBotClient,
	type TelegramConfig,
	type TelegramMessages,
	TelegramUpdateDispatcher,
	TelegramUpdatesRunner
} from './modules/telegram';
import {
	createTransferRepository,
	createTransferService
} from './modules/transfer';

/**
 * Builds the production object graph explicitly at the application boundary.
 */
export function createApiDependencies(): {
	authController: AuthHttpController;
	accountController: AccountHttpController;
	categoryController: CategoryHttpController;
	contactController: ContactHttpController;
	exchangeRateController: ExchangeRateHttpController;
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
		messages: TelegramMessages;
		/** Present in `webhook` and `polling` modes; `start()` it after the server listens. */
		updatesRunner: TelegramUpdatesRunner | undefined;
		/** Present in `webhook` mode only; in the other modes the route does not exist. */
		webhookController: TelegramWebhookHttpController | undefined;
	};
	transferController: TransferHttpController;
} {
	const authConfig = getAuthConfig();
	// Throws, and so stops the start, when the Telegram environment is half configured or the bot texts are broken.
	const telegramConfig = getTelegramConfig(process.env, authConfig.origin);
	const telegramMessages = loadTelegramMessages();
	const telegramBotClient = telegramConfig.botToken === undefined
		? undefined
		: new FetchTelegramBotClient({ token: telegramConfig.botToken });
	// A3 replaces the stand-in with the sign-in handler.
	const telegramDispatcher = new TelegramUpdateDispatcher(new IgnoringTelegramUpdateHandler(), new ProcessedUpdateIds());
	const sessionRepository = new SessionRepository(db);
	const sessionService = new SessionService(sessionRepository, {
		config: authConfig
	});
	const passwordUserRepository = new PasswordUserRepository(db);
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
	const webAuthnCredentialRepository = new WebAuthnCredentialRepository(db);
	const webAuthnService = new WebAuthnService({
		challengeRepository: new WebAuthnChallengeRepository(db),
		config: authConfig,
		credentialRepository: webAuthnCredentialRepository,
		sessionService
	});
	const securityService = new SecurityService({
		credentialRepository: webAuthnCredentialRepository,
		passwordService,
		// This limiter is keyed by `unknown:<userId>` (no address) and must stay a plain per-user attempt counter. The
		// per-username and per-address ceilings of the sign-in form would add counters with different behavior.
		rateLimiter: new LoginRateLimiter({
			maxAttemptsPerIp: Number.POSITIVE_INFINITY,
			maxAttemptsPerUsername: Number.POSITIVE_INFINITY
		}),
		sessionRepository,
		userRepository: passwordUserRepository
	});
	const householdResolver = new HouseholdResolver(new HouseholdRepository(db));
	const categoryService = new CategoryService({
		categoryRepository: new CategoryRepository(db),
		householdResolver
	});
	const contactService = new ContactService({
		contactRepository: new ContactRepository(db),
		householdResolver
	});
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(db), {
		dailyRateProvider: new NationalBankExchangeRateClient()
	});
	const accountService = new AccountService({
		accountRepository: new AccountRepository(db),
		householdResolver
	});
	const operationService = new OperationService({
		accountRepository: new AccountRepository(db),
		categoryRepository: new CategoryRepository(db),
		contactRepository: new ContactRepository(db),
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		operationRepository: new OperationRepository(db)
	});
	const transferService = createTransferService({
		accountRepository: new AccountRepository(db),
		contactRepository: new ContactRepository(db),
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		transferRepository: createTransferRepository(db)
	});
	const configuredRetentionDays = Number(process.env.RECEIPT_IMAGE_RETENTION_DAYS);
	const receiptImportService = new ReceiptImportService({
		accountRepository: new AccountRepository(db),
		imageRetentionDays: Number.isInteger(configuredRetentionDays) && configuredRetentionDays > 0
			? configuredRetentionDays
			: undefined,
		categoryRepository: new CategoryRepository(db),
		contactRepository: new ContactRepository(db),
		householdResolver,
		imageStorage: createReceiptImageStorage(),
		operationService,
		receiptImportRepository: createReceiptImportRepository(db)
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
			messages: telegramMessages,
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
