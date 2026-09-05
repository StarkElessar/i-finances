import type { ExchangeRateResolver } from '@/modules/exchange-rate';
import { convertMinorUnitsByExchangeRate } from '@/modules/exchange-rate';

import type { CurrencyCode } from '@i-finances/contracts';

import type {
	AccountCurrencyCorrectionRepository,
	AccountCurrencyOperationRewrite
} from './account-currency-correction-repository';
import { AccountConversionAmountError } from './account-errors';
import type { AccountRecord, AccountUpdateValues } from './account-repository';

export type CorrectAccountCurrencyInput = {
	accountId: string;
	accountValues: AccountUpdateValues;
	expectedVersion: number;
	householdBaseCurrency: CurrencyCode;
	householdId: string;
	updatedByUserId: string;
};

/**
 * Resolves historical quotes before delegating the atomic rewrite to a
 * repository-owned transaction.
 */
export class AccountCurrencyCorrector {
	public constructor(
		private readonly repository: AccountCurrencyCorrectionRepository,
		private readonly exchangeRateResolver: ExchangeRateResolver
	) {}

	public hasOperations(householdId: string, accountId: string): Promise<boolean> {
		return this.repository.hasOperations(householdId, accountId);
	}

	public async correct(
		input: CorrectAccountCurrencyInput
	): Promise<AccountRecord | undefined> {
		const operations = await this.repository.listOperations(input.householdId, input.accountId);

		if (operations.length === 0) {
			return undefined;
		}

		const operationRewrites = await Promise.all(operations.map(
			async (operation): Promise<AccountCurrencyOperationRewrite> => {
				const quote = await this.exchangeRateResolver.resolve({
					fromCurrency: input.accountValues.currency,
					onDate: operation.happenedOn,
					toCurrency: input.householdBaseCurrency
				});
				const convertedAmount = convertMinorUnitsByExchangeRate(
					operation.amountMinor,
					quote.rate
				);

				if (convertedAmount <= 0) {
					throw new AccountConversionAmountError();
				}

				return {
					amountInHouseholdBaseCurrencyMinor: convertedAmount,
					currency: input.accountValues.currency,
					exchangeRate: quote.rate,
					exchangeRateEffectiveOn: quote.effectiveOn,
					exchangeRateSource: quote.source,
					householdBaseCurrency: input.householdBaseCurrency,
					id: operation.id,
					version: operation.version
				};
			}
		));

		return this.repository.apply({
			accountId: input.accountId,
			accountValues: input.accountValues,
			expectedVersion: input.expectedVersion,
			householdBaseCurrency: input.householdBaseCurrency,
			householdId: input.householdId,
			operationRewrites,
			updatedByUserId: input.updatedByUserId
		});
	}
}
