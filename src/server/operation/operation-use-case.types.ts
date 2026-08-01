import type { OperationRepository } from './operation-repository';
import type { OperationRules } from './operation-rules';

import type { AccountRepository } from '~/server/account/account-repository';
import type { ExchangeRateResolver } from '~/server/exchange-rate/exchange-rate-service';
import type { HouseholdResolver } from '~/server/household/household-service';

export type OperationUseCaseContext = {
	accountRepository: AccountRepository;
	createId: () => string;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	now: () => Date;
	operationRepository: OperationRepository;
	rules: OperationRules;
};
