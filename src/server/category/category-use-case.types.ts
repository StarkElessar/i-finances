import type { HouseholdResolver } from '~/server/household/household-service';

import type { CategoryRepository } from './category-repository';
import type { CategoryRules } from './category-rules';

export type CategoryUseCaseContext = {
	categoryRepository: CategoryRepository;
	householdResolver: HouseholdResolver;
	rules: CategoryRules;
	createId: () => string;
	now: () => Date;
};
