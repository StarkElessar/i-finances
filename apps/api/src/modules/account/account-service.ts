import { randomUUID } from 'node:crypto';

import type { HouseholdResolver } from '@/modules/household';

import {
	type AccountCollection,
	type ChangeAccountArchiveStateInput,
	type CreateAccountInput,
	type PersistedAccount,
	type UpdateAccountInput
} from '@i-finances/contracts';

import type { AccountCurrencyCorrector } from './account-currency-corrector';
import { AccountCurrencyCorrectionRequiredError, AccountVersionConflictError } from './account-errors';
import type { AccountRecord, AccountRepository } from './account-repository';
import { AccountRules } from './account-rules';

export type AccountServiceDependencies = {
	accountCurrencyCorrector: Pick<AccountCurrencyCorrector, 'correct' | 'hasOperations'>;
	accountRepository: AccountRepository;
	createId?: () => string;
	householdResolver: HouseholdResolver;
	now?: () => Date;
};

function toPersistedAccount(record: AccountRecord): PersistedAccount {
	return {
		archivedAt: record.archivedAt?.toISOString() ?? null,
		color: record.color,
		createdAt: record.createdAt.toISOString(),
		currency: record.currency,
		description: record.description,
		id: record.id,
		initialBalanceMinor: record.initialBalanceMinor,
		isColorAccentEnabled: record.isColorAccentEnabled,
		isIncludedInFamilyTotal: record.isIncludedInFamilyTotal,
		name: record.name,
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}

/**
 * Orchestrates account use cases while leaving household and persistence
 * invariants in their dedicated collaborators.
 */
export class AccountService {
	private readonly createId: () => string;
	private readonly now: () => Date;
	private readonly rules: AccountRules;

	public constructor(
		private readonly dependencies: AccountServiceDependencies
	) {
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
		this.rules = new AccountRules(
			dependencies.accountRepository,
			dependencies.householdResolver
		);
	}

	public async list(userId: string, includeArchived: boolean): Promise<AccountCollection> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const records = await this.dependencies.accountRepository.list(household.id, includeArchived);

		return {
			baseCurrency: household.baseCurrency,
			items: records.map(toPersistedAccount)
		};
	}

	public async create(userId: string, input: CreateAccountInput): Promise<PersistedAccount> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const timestamp = this.now();
		const record = await this.dependencies.accountRepository.insert({
			...input,
			archivedAt: null,
			createdAt: timestamp,
			createdByUserId: userId,
			householdId: household.id,
			id: this.createId(),
			updatedAt: timestamp,
			version: 1
		});

		return toPersistedAccount(record);
	}

	public async update(userId: string, input: UpdateAccountInput): Promise<PersistedAccount> {
		const current = await this.rules.requireCurrent(userId, input.id);
		this.rules.assertVersion(current.record, input.version);

		const accountValues = {
			color: input.color,
			currency: input.currency,
			description: input.description,
			initialBalanceMinor: input.initialBalanceMinor,
			isColorAccentEnabled: input.isColorAccentEnabled,
			isIncludedInFamilyTotal: input.isIncludedInFamilyTotal,
			name: input.name,
			type: input.type,
			updatedAt: this.now()
		};

		if (
			current.record.currency !== input.currency
			&& await this.dependencies.accountCurrencyCorrector.hasOperations(
				current.householdId,
				current.record.id
			)
		) {
			if (!input.confirmCurrencyCorrection) {
				throw new AccountCurrencyCorrectionRequiredError();
			}

			const correctedRecord = await this.dependencies.accountCurrencyCorrector.correct({
				accountId: current.record.id,
				accountValues,
				expectedVersion: input.version,
				householdBaseCurrency: current.householdBaseCurrency,
				householdId: current.householdId,
				updatedByUserId: userId
			});

			if (correctedRecord !== undefined) {
				return toPersistedAccount(correctedRecord);
			}
		}

		const updatedRecord = await this.dependencies.accountRepository.update(
			current.householdId,
			input.id,
			input.version,
			accountValues
		);

		if (updatedRecord === undefined) {
			throw new AccountVersionConflictError();
		}

		return toPersistedAccount(updatedRecord);
	}

	public archive(userId: string, input: ChangeAccountArchiveStateInput): Promise<PersistedAccount> {
		return this.changeArchiveState(userId, input, true);
	}

	public restore(userId: string, input: ChangeAccountArchiveStateInput): Promise<PersistedAccount> {
		return this.changeArchiveState(userId, input, false);
	}

	private async changeArchiveState(
		userId: string,
		input: ChangeAccountArchiveStateInput,
		archived: boolean
	): Promise<PersistedAccount> {
		const current = await this.rules.requireCurrent(userId, input.id);
		this.rules.assertVersion(current.record, input.version);
		const alreadyInTargetState = archived
			? current.record.archivedAt !== null
			: current.record.archivedAt === null;

		if (alreadyInTargetState) {
			return toPersistedAccount(current.record);
		}

		const timestamp = this.now();
		const updatedRecord = await this.dependencies.accountRepository.setArchivedAt(
			current.householdId,
			input.id,
			input.version,
			archived ? timestamp : null,
			timestamp
		);

		if (updatedRecord === undefined) {
			throw new AccountVersionConflictError();
		}

		return toPersistedAccount(updatedRecord);
	}
}
