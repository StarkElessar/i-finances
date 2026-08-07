import { CategoryHttpController } from './http/category-controller';
import { CookieSessionResolver } from './http/session-resolver';
import { db } from './infrastructure/database/client';
import { SessionRepository, SessionService } from './modules/auth';
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
	categoryController: CategoryHttpController;
} {
	const sessionService = new SessionService(new SessionRepository(db));
	const householdResolver = new HouseholdResolver(new HouseholdRepository(db));
	const categoryService = new CategoryService({
		categoryRepository: new CategoryRepository(db),
		householdResolver
	});

	return {
		categoryController: new CategoryHttpController(
			categoryService,
			new CookieSessionResolver(sessionService)
		)
	};
}
