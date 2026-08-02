import type { HouseholdResolver } from '~/server/household/household-service';

import type { ContactRepository } from './contact-repository';
import type { ContactRules } from './contact-rules';

export type ContactUseCaseContext = {
	contactRepository: ContactRepository;
	householdResolver: HouseholdResolver;
	rules: ContactRules;
	createId: () => string;
	now: () => Date;
};
