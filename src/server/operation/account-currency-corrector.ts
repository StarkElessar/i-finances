import type {
	AccountCurrencyCorrector,
	CorrectAccountCurrencyInput
} from '~/server/account/account-currency-corrector';
import { AccountCurrencyCorrectionConflictError } from '~/server/account/account-errors';
import { type AppDatabase, db } from '~/server/db/client';
import type { OperationRecord } from '~/server/db/schema';
import {
	accounts,
	operations
} from '~/server/db/schema';
import type { ExchangeRateResolver } from '~/server/exchange-rate/exchange-rate-service';

import {
	and,
	eq,
	sql
} from 'drizzle-orm';

import { createOperationRateSnapshot } from './operation-rate';

export type OperationAccountCurrencyCorrectorDependencies = {
	exchangeRateResolver: ExchangeRateResolver;
	database?: AppDatabase;
};

type OperationCurrencyRewrite = {
	operation: OperationRecord;
	rate: string;
	rateEffectiveOn: string;
	rateSource: string;
	convertedAmountMinor: number;
};

/**
 * Creates the transaction coordinator used when a populated account currency
 * must be corrected without changing operation amounts.
 */
export function createOperationAccountCurrencyCorrector(
	dependencies: OperationAccountCurrencyCorrectorDependencies
): AccountCurrencyCorrector {
	const database = dependencies.database ?? db;

	const hasOperations = async (
		householdId: string,
		accountId: string
	): Promise<boolean> => {
		const record = database.select({ id: operations.id })
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId)
			))
			.limit(1)
			.get();

		return record !== undefined;
	};

	const correct = async (
		input: CorrectAccountCurrencyInput
	) => {
		const operationRecords = await database.select()
			.from(operations)
			.where(and(
				eq(operations.householdId, input.householdId),
				eq(operations.accountId, input.accountId)
			));

		if (operationRecords.length === 0) {
			return undefined;
		}

		const rewrites = await Promise.all(operationRecords.map(
			async (operation): Promise<OperationCurrencyRewrite> => {
				const quote = await dependencies.exchangeRateResolver.resolve({
					fromCurrency: input.accountValues.currency,
					onDate: operation.happenedOn,
					toCurrency: input.householdBaseCurrency
				});
				const snapshot = createOperationRateSnapshot(
					operation.amountMinor,
					quote,
					input.accountValues.currency,
					input.householdBaseCurrency
				);

				return {
					convertedAmountMinor:
						snapshot.amountInHouseholdBaseCurrencyMinor,
					operation,
					rate: quote.rate,
					rateEffectiveOn: quote.effectiveOn,
					rateSource: quote.source
				};
			}
		));

		return database.transaction((transaction) => {
			const accountUpdate = transaction.update(accounts)
				.set({
					...input.accountValues,
					version: sql`${accounts.version} + 1`
				})
				.where(and(
					eq(accounts.householdId, input.householdId),
					eq(accounts.id, input.accountId),
					eq(accounts.version, input.expectedVersion)
				))
				.run();

			if (accountUpdate.changes !== 1) {
				throw new AccountCurrencyCorrectionConflictError();
			}

			rewrites.forEach((rewrite) => {
				const result = transaction.update(operations)
					.set({
						amountInHouseholdBaseCurrencyMinor:
							rewrite.convertedAmountMinor,
						currency: input.accountValues.currency,
						exchangeRate: rewrite.rate,
						exchangeRateEffectiveOn: rewrite.rateEffectiveOn,
						exchangeRateSource: rewrite.rateSource,
						householdBaseCurrency: input.householdBaseCurrency,
						updatedAt: input.accountValues.updatedAt,
						updatedByUserId: input.updatedByUserId,
						version: sql`${operations.version} + 1`
					})
					.where(and(
						eq(operations.householdId, input.householdId),
						eq(operations.accountId, input.accountId),
						eq(operations.id, rewrite.operation.id),
						eq(operations.version, rewrite.operation.version)
					))
					.run();

				if (result.changes !== 1) {
					throw new AccountCurrencyCorrectionConflictError();
				}
			});

			return transaction.select()
				.from(accounts)
				.where(and(
					eq(accounts.householdId, input.householdId),
					eq(accounts.id, input.accountId)
				))
				.limit(1)
				.get();
		});
	};

	return {
		correct,
		hasOperations
	};
}
