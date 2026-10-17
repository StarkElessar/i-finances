import { randomUUID } from 'node:crypto';

import type { HouseholdResolver } from '@/modules/household';

import {
	type AccountCollection,
	type ChangeAccountArchiveStateInput,
	type CreateAccountInput,
	type PersistedAccount,
	type PersistedAccountFull,
	type UpdateAccountInput
} from '@i-finances/contracts';

import { ACCOUNT_DETAILS_HANDLERS } from './details/account-details-handlers';
import { AccountCurrencyLockedError } from './account-currency-locked-error';
import type { AccountRecord, AccountRepository } from './account-repository';
import { AccountRules } from './account-rules';
import { AccountVersionConflictError } from './account-version-conflict-error';

export type AccountServiceDependencies = {
	accountRepository: AccountRepository;
	createId?: () => string;
	householdResolver: HouseholdResolver;
	now?: () => Date;
};

function toBasePersistedFields(record: AccountRecord, hasOperations: boolean) {
	return {
		archivedAt: record.archivedAt?.toISOString() ?? null,
		color: record.color,
		createdAt: record.createdAt.toISOString(),
		currency: record.currency,
		description: record.description,
		hasOperations,
		id: record.id,
		initialBalanceMinor: record.initialBalanceMinor,
		isColorAccentEnabled: record.isColorAccentEnabled,
		isIncludedInFamilyTotal: record.isIncludedInFamilyTotal,
		name: record.name,
		owner: record.owner,
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}

// The handler registry is the single place that correlates `type` with the shape of `details`,
// so the contract union cannot be narrowed statically here.
function toPersistedAccount(record: AccountRecord, hasOperations: boolean): PersistedAccount {
	return {
		...toBasePersistedFields(record, hasOperations),
		details: ACCOUNT_DETAILS_HANDLERS[record.type].toView(record.details)
	} as PersistedAccount;
}

function toPersistedAccountFull(record: AccountRecord, hasOperations: boolean): PersistedAccountFull {
	return {
		...toBasePersistedFields(record, hasOperations),
		details: ACCOUNT_DETAILS_HANDLERS[record.type].toFull(record.details)
	} as PersistedAccountFull;
}

function toEditableValues(input: CreateAccountInput | UpdateAccountInput) {
	return {
		color: input.color,
		currency: input.currency,
		description: input.description,
		initialBalanceMinor: input.initialBalanceMinor,
		isColorAccentEnabled: input.isColorAccentEnabled,
		isIncludedInFamilyTotal: input.isIncludedInFamilyTotal,
		name: input.name,
		owner: input.owner,
		type: input.type
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
		const [records, accountIdsWithOperations] = await Promise.all([
			this.dependencies.accountRepository.list(household.id, includeArchived),
			this.dependencies.accountRepository.listAccountIdsWithOperations(household.id)
		]);

		return {
			baseCurrency: household.baseCurrency,
			items: records.map((record) => toPersistedAccount(
				record,
				accountIdsWithOperations.has(record.id)
			))
		};
	}

	public async get(userId: string, accountId: string): Promise<PersistedAccountFull> {
		const current = await this.rules.requireCurrent(userId, accountId);
		const hasOperations = await this.dependencies.accountRepository.hasOperations(
			current.householdId,
			current.record.id
		);

		return toPersistedAccountFull(current.record, hasOperations);
	}

	public async create(userId: string, input: CreateAccountInput): Promise<PersistedAccount> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const timestamp = this.now();
		const record = await this.dependencies.accountRepository.insert({
			...toEditableValues(input),
			archivedAt: null,
			createdAt: timestamp,
			createdByUserId: userId,
			details: ACCOUNT_DETAILS_HANDLERS[input.type].toStored(input.details, undefined),
			householdId: household.id,
			id: this.createId(),
			updatedAt: timestamp,
			version: 1
		});

		return toPersistedAccount(record, false);
	}

	public async update(userId: string, input: UpdateAccountInput): Promise<PersistedAccount> {
		const current = await this.rules.requireCurrent(userId, input.id);
		this.rules.assertVersion(current.record, input.version);

		const sameType = current.record.type === input.type;
		const accountValues = {
			...toEditableValues(input),
			details: ACCOUNT_DETAILS_HANDLERS[input.type].toStored(
				input.details,
				sameType ? current.record.details : undefined
			),
			updatedAt: this.now()
		};

		const hasOperations = await this.dependencies.accountRepository.hasOperations(
			current.householdId,
			current.record.id
		);

		// Operations keep the currency they were recorded in, so it cannot change under them.
		if (current.record.currency !== input.currency && hasOperations) {
			throw new AccountCurrencyLockedError();
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

		return toPersistedAccount(updatedRecord, hasOperations);
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
		const hasOperations = await this.dependencies.accountRepository.hasOperations(
			current.householdId,
			current.record.id
		);
		const alreadyInTargetState = archived
			? current.record.archivedAt !== null
			: current.record.archivedAt === null;

		if (alreadyInTargetState) {
			return toPersistedAccount(current.record, hasOperations);
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

		return toPersistedAccount(updatedRecord, hasOperations);
	}
}
