import type { CurrencyCode } from '@i-finances/contracts';

import type { HouseholdResolver } from '../household';

import { AccountNotFoundError, AccountVersionConflictError } from './account-errors';
import type { AccountRecord, AccountRepository } from './account-repository';

export type CurrentAccount = {
	householdBaseCurrency: CurrencyCode;
	householdId: string;
	record: AccountRecord;
};

/**
 * Centralizes household scope and optimistic-lock invariants for accounts.
 */
export class AccountRules {
	public constructor(
		private readonly accountRepository: AccountRepository,
		private readonly householdResolver: HouseholdResolver
	) {}

	public async requireCurrent(userId: string, accountId: string): Promise<CurrentAccount> {
		const household = await this.householdResolver.requireForUser(userId);
		const record = await this.accountRepository.findById(household.id, accountId);

		if (record === undefined) {
			throw new AccountNotFoundError();
		}

		return {
			householdBaseCurrency: household.baseCurrency,
			householdId: household.id,
			record
		};
	}

	public assertVersion(record: AccountRecord, expectedVersion: number): void {
		if (record.version !== expectedVersion) {
			throw new AccountVersionConflictError();
		}
	}
}
