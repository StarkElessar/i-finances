import { AuthHttpController } from './http/auth-controller';
import { CategoryHttpController } from './http/category-controller';
import { CookieSessionResolver } from './http/session-resolver';
import { db } from './infrastructure/database/client';
import {
	getAuthConfig,
	LoginRateLimiter,
	PasswordService,
	PasswordSignInService,
	PasswordUserRepository,
	SessionRepository,
	SessionService
} from './modules/auth';
import {
	CategoryRepository,
	CategoryService
} from './modules/category';
import {
	HouseholdRepository,
	HouseholdResolver
} from './modules/household';

/**
 * Builds the production object graph explicitly at the application boundary.
 */
export function createApiDependencies(): {
	authController: AuthHttpController;
	categoryController: CategoryHttpController;
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
	const householdResolver = new HouseholdResolver(new HouseholdRepository(db));
	const categoryService = new CategoryService({
		categoryRepository: new CategoryRepository(db),
		householdResolver
	});

	return {
		authController: new AuthHttpController(
			passwordSignInService,
			sessionService,
			sessionResolver,
			authConfig
		),
		categoryController: new CategoryHttpController(
			categoryService,
			sessionResolver
		)
	};
}
