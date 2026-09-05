import type { AppDatabase } from '@/infrastructure/database/client';
import { accounts, operations } from '@/infrastructure/database/schema';

import type { CurrencyCode } from '@i-finances/contracts';
import { and, eq, sql } from 'drizzle-orm';

import { AccountCurrencyCorrectionConflictError } from './account-errors';
import type { AccountRecord, AccountUpdateValues } from './account-repository';

export type AccountCurrencyOperation = {
	amountMinor: number;
	happenedOn: string;
	id: string;
	version: number;
};

export type AccountCurrencyOperationRewrite = {
	amountInHouseholdBaseCurrencyMinor: number;
	currency: CurrencyCode;
	exchangeRate: string;
	exchangeRateEffectiveOn: string;
	exchangeRateSource: string;
	householdBaseCurrency: CurrencyCode;
	id: string;
	version: number;
};

export type ApplyAccountCurrencyCorrectionInput = {
	accountId: string;
	accountValues: AccountUpdateValues;
	expectedVersion: number;
	householdBaseCurrency: CurrencyCode;
	householdId: string;
	operationRewrites: AccountCurrencyOperationRewrite[];
	updatedByUserId: string;
};

/**
 * Owns the cross-aggregate SQLite transaction for currency correction.
 */
export class AccountCurrencyCorrectionRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async hasOperations(householdId: string, accountId: string): Promise<boolean> {
		const record = this.database.select({ id: operations.id })
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId)
			))
			.limit(1)
			.get();

		return record !== undefined;
	}

	public async listOperations(
		householdId: string,
		accountId: string
	): Promise<AccountCurrencyOperation[]> {
		return this.database.select({
			amountMinor: operations.amountMinor,
			happenedOn: operations.happenedOn,
			id: operations.id,
			version: operations.version
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId)
			));
	}

	public async apply(
		input: ApplyAccountCurrencyCorrectionInput
	): Promise<AccountRecord | undefined> {
		return this.database.transaction((transaction) => {
			const updatedAccount = transaction.update(accounts)
				.set({
					...input.accountValues,
					version: sql`${accounts.version} + 1`
				})
				.where(and(
					eq(accounts.householdId, input.householdId),
					eq(accounts.id, input.accountId),
					eq(accounts.version, input.expectedVersion)
				))
				.returning()
				.get() as typeof accounts.$inferSelect | undefined;

			if (updatedAccount === undefined) {
				return undefined;
			}

			input.operationRewrites.forEach((rewrite) => {
				const result = transaction.update(operations)
					.set({
						amountInHouseholdBaseCurrencyMinor: rewrite.amountInHouseholdBaseCurrencyMinor,
						currency: rewrite.currency,
						exchangeRate: rewrite.exchangeRate,
						exchangeRateEffectiveOn: rewrite.exchangeRateEffectiveOn,
						exchangeRateSource: rewrite.exchangeRateSource,
						householdBaseCurrency: rewrite.householdBaseCurrency,
						updatedAt: input.accountValues.updatedAt,
						updatedByUserId: input.updatedByUserId,
						version: sql`${operations.version} + 1`
					})
					.where(and(
						eq(operations.householdId, input.householdId),
						eq(operations.accountId, input.accountId),
						eq(operations.id, rewrite.id),
						eq(operations.version, rewrite.version)
					))
					.run();

				if (result.changes !== 1) {
					throw new AccountCurrencyCorrectionConflictError();
				}
			});

			return {
				archivedAt: updatedAccount.archivedAt,
				color: updatedAccount.color,
				createdAt: updatedAccount.createdAt,
				createdByUserId: updatedAccount.createdByUserId,
				currency: updatedAccount.currency,
				description: updatedAccount.description,
				householdId: updatedAccount.householdId,
				id: updatedAccount.id,
				initialBalanceMinor: updatedAccount.initialBalanceMinor,
				isColorAccentEnabled: updatedAccount.isColorAccentEnabled,
				isIncludedInFamilyTotal: updatedAccount.isIncludedInFamilyTotal,
				name: updatedAccount.name,
				type: updatedAccount.type,
				updatedAt: updatedAccount.updatedAt,
				version: updatedAccount.version
			};
		});
	}
}
