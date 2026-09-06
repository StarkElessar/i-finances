import { AccountHttpController } from './http/account-controller';
import { AuthHttpController } from './http/auth-controller';
import { CategoryHttpController } from './http/category-controller';
import { ContactHttpController } from './http/contact-controller';
import { ExchangeRateHttpController } from './http/exchange-rate-controller';
import { OperationHttpController } from './http/operation-controller';
import { PasskeyHttpController } from './http/passkey-controller';
import { ReceiptImportHttpController } from './http/receipt-import-controller';
import { ReceiptWorkerHttpController } from './http/receipt-worker-controller';
import { CookieSessionResolver } from './http/session-resolver';
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
	createReceiptImageStorage,
	createReceiptImportRepository,
	ReceiptImportService
} from './modules/receipt-import';

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
	receiptWorkerController: ReceiptWorkerHttpController;
} {
	const authConfig = getAuthConfig();
	const sessionService = new SessionService(new SessionRepository(db), {
		config: authConfig
	});
	const sessionResolver = new CookieSessionResolver(
		sessionService,
		authConfig.sessionCookieName
	);
	const passwordSignInService = new PasswordSignInService({
		passwordService: new PasswordService(),
		rateLimiter: new LoginRateLimiter(),
		sessionService,
		userRepository: new PasswordUserRepository(db)
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
	const receiptImportService = new ReceiptImportService({
		accountRepository: new AccountRepository(db),
		categoryRepository: new CategoryRepository(db),
		householdResolver,
		imageStorage: createReceiptImageStorage(),
		operationService,
		receiptImportRepository: createReceiptImportRepository(db)
	});

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
		receiptWorkerController: new ReceiptWorkerHttpController(receiptImportService),
		passkeyController: new PasskeyHttpController(
			webAuthnService,
			sessionResolver,
			authConfig
		)
	};
}
