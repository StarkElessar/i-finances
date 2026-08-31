import type { AccountRepository } from '~/server/account/account-repository';
import type { CategoryRepository } from '~/server/category/category-repository';
import type { ContactRepository } from '~/server/contact/contact-repository';
import type { ExchangeRateResolver } from '~/server/exchange-rate/exchange-rate-service';
import type { HouseholdResolver } from '~/server/household/household-service';

import type { OperationRepository } from './operation-repository';
import type { OperationRules } from './operation-rules';

export type OperationUseCaseContext = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	contactRepository: ContactRepository;
	createId: () => string;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	now: () => Date;
	operationRepository: OperationRepository;
	rules: OperationRules;
};
