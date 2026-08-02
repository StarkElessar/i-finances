import type { CurrencyCodeValue } from '~/shared/lib';

import type { AccountRecord } from '~/server/db/schema';

import type { AccountUpdateValues } from './account-repository';

export type CorrectAccountCurrencyInput = {
	accountId: string;
	accountValues: AccountUpdateValues;
	expectedVersion: number;
	householdBaseCurrency: CurrencyCodeValue;
	householdId: string;
	updatedByUserId: string;
};

/**
 * Coordinates the cross-aggregate transaction required by currency correction.
 */
export type AccountCurrencyCorrector = {
	correct: (
		input: CorrectAccountCurrencyInput
	) => Promise<AccountRecord | undefined>;
	hasOperations: (
		householdId: string,
		accountId: string
	) => Promise<boolean>;
};
