import { CurrencyCode } from '~/shared/lib';

import type { CurrentExchangeRates } from '~/entities/exchange-rate/model/types';

import { requireUser } from '~/server/auth/require-user';
import { formatBelarusLocalDateKey } from '~/server/exchange-rate/exchange-rate-date';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createNationalBankExchangeRateClient } from '~/server/exchange-rate/national-bank-client';
import { createHouseholdRepository } from '~/server/household/household-repository';
import {
	createHouseholdResolver
} from '~/server/household/household-service';

import { query } from '@solidjs/router';

const householdResolver = createHouseholdResolver(createHouseholdRepository());
const exchangeRateService = createExchangeRateService({
	dailyRateProvider: createNationalBankExchangeRateClient(),
	exchangeRateRepository: createExchangeRateRepository()
});

async function readCurrentExchangeRates(): Promise<CurrentExchangeRates> {
	'use server';

	const session = await requireUser();
	const household = await householdResolver.requireForUser(session.user.id);

	return exchangeRateService.getCurrent({
		baseCurrency: household.baseCurrency,
		currencies: CurrencyCode.values(),
		requestedOn: formatBelarusLocalDateKey(new Date())
	});
}

export const getCurrentExchangeRates = query(
	readCurrentExchangeRates,
	'current-exchange-rates'
);
