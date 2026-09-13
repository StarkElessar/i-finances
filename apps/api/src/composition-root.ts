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
import { CookieSessionResolver } from './http/session-resolver';
import { TransferHttpController } from './http/transfer-controller';
import { db } from './infrastructure/database/client';
import {
	AccountCurrencyCorrectionRepository,
	AccountCurrencyCorrector,
	AccountRepository,
	AccountService
} from './modules/account';
import {
	getAuthConfig,
	LoginRateLimiter,
	PasswordService,
	PasswordSignInService,
	PasswordUserRepository,
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
	startReceiptProcessing: () => Promise<ReceiptProcessingLoop | undefined>;
	transferController: TransferHttpController;
} {
	const authConfig = getAuthConfig();
	const sessionService = new SessionService(new SessionRepository(db), {
		config: authConfig
	});
	const passwordUserRepository = new PasswordUserRepository(db);
	const sessionResolver = new CompositeSessionResolver([
		new CookieSessionResolver(sessionService, authConfig.sessionCookieName),
		new ApiKeySessionResolver(passwordUserRepository)
	]);
	const passwordSignInService = new PasswordSignInService({
		passwordService: new PasswordService(),
		rateLimiter: new LoginRateLimiter(),
		sessionService,
		userRepository: passwordUserRepository
	});
	const webAuthnService = new WebAuthnService({
		challengeRepository: new WebAuthnChallengeRepository(db),
		config: authConfig,
		credentialRepository: new WebAuthnCredentialRepository(db),
		sessionService
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
		accountCurrencyCorrector: new AccountCurrencyCorrector(
			new AccountCurrencyCorrectionRepository(db),
			exchangeRateService
		),
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

		if (apiKey === undefined || apiKey.trim() === '') {
			console.warn('RECEIPT_LITELLM_API_KEY is not set; the receipt processing loop will not start.');

			return undefined;
		}

		await receiptImportService.recoverStaleProcessingJobs();

		return startReceiptProcessingLoop({
			imageStorage: createReceiptImageStorage(),
			litellmClient: createLiteLlmClient({
				apiKey,
				baseUrl: process.env.RECEIPT_LITELLM_BASE_URL ?? 'https://litellm.holdingbp.ru:4000/v1',
				categorizationModel: process.env.RECEIPT_LITELLM_CATEGORIZATION_MODEL ?? 'deepseek-v4-flash',
				ocrModel: process.env.RECEIPT_LITELLM_OCR_MODEL ?? 'deepseek-v4-flash-vision-exp',
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

	return {
		authController: new AuthHttpController(
			passwordSignInService,
			sessionService,
			sessionResolver,
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
		startReceiptProcessing,
		transferController: new TransferHttpController(
			transferService,
			sessionResolver
		),
		passkeyController: new PasskeyHttpController(
			webAuthnService,
			sessionResolver,
			authConfig
		)
	};
}
