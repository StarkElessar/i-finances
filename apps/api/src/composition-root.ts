import { AccountHttpController } from './http/account-controller';
import { AuthHttpController } from './http/auth-controller';
import { CategoryHttpController } from './http/category-controller';
import { PasskeyHttpController } from './http/passkey-controller';
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
	ExchangeRateRepository,
	ExchangeRateService
} from './modules/exchange-rate';
import {
	HouseholdRepository,
	HouseholdResolver
} from './modules/household';

/**
 * Builds the production object graph explicitly at the application boundary.
 */
export function createApiDependencies(): {
	authController: AuthHttpController;
	accountController: AccountHttpController;
	categoryController: CategoryHttpController;
	passkeyController: PasskeyHttpController;
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
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(db));
	const accountService = new AccountService({
		accountCurrencyCorrector: new AccountCurrencyCorrector(
			new AccountCurrencyCorrectionRepository(db),
			exchangeRateService
		),
		accountRepository: new AccountRepository(db),
		householdResolver
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
		passkeyController: new PasskeyHttpController(
			webAuthnService,
			sessionResolver,
			authConfig
		)
	};
}
