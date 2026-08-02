import { randomUUID } from 'node:crypto';

import type {
	ChangeAccountArchiveStateInput,
	CreateAccountInput,
	UpdateAccountInput
} from '~/entities/account/api/account.contract';
import type { PersistedAccount } from '~/entities/account/model/types';

import type { AccountRecord } from '~/server/db/schema';
import type { HouseholdResolver } from '~/server/household/household-service';

import type { AccountCurrencyCorrector } from './account-currency-corrector';
import {
	AccountCurrencyCorrectionRequiredError,
	AccountNotFoundError,
	AccountVersionConflictError
} from './account-errors';
import type { AccountRepository } from './account-repository';

export {
	AccountCurrencyCorrectionConflictError,
	AccountCurrencyCorrectionRequiredError,
	AccountNotFoundError,
	AccountVersionConflictError
} from './account-errors';

export type AccountServiceDependencies = {
	accountCurrencyCorrector: AccountCurrencyCorrector;
	accountRepository: AccountRepository;
	householdResolver: HouseholdResolver;
	createId?: () => string;
	now?: () => Date;
};

export type AccountService = {
	archive: (
		userId: string,
		input: ChangeAccountArchiveStateInput
	) => Promise<PersistedAccount>;
	create: (
		userId: string,
		input: CreateAccountInput
	) => Promise<PersistedAccount>;
	list: (
		userId: string,
		includeArchived: boolean
	) => Promise<PersistedAccount[]>;
	restore: (
		userId: string,
		input: ChangeAccountArchiveStateInput
	) => Promise<PersistedAccount>;
	update: (
		userId: string,
		input: UpdateAccountInput
	) => Promise<PersistedAccount>;
};

/**
 * Creates the account application service with injectable infrastructure.
 */
export function createAccountService(
	dependencies: AccountServiceDependencies
): AccountService {
	const createId = dependencies.createId ?? randomUUID;
	const now = dependencies.now ?? (() => new Date());

	const requireCurrentAccount = async (
		userId: string,
		accountId: string
	) => {
		const household = await dependencies.householdResolver.requireForUser(userId);
		const record = await dependencies.accountRepository.findById(
			household.id,
			accountId
		);

		if (record) {
			return {
				household,
				record
			};
		}

		throw new AccountNotFoundError();
	};

	const assertVersion = (record: AccountRecord, expectedVersion: number): void => {
		if (record.version === expectedVersion) {
			return;
		}

		throw new AccountVersionConflictError();
	};

	const list = async (
		userId: string,
		includeArchived: boolean
	): Promise<PersistedAccount[]> => {
		const household = await dependencies.householdResolver.requireForUser(userId);
		const records = await dependencies.accountRepository.list(
			household.id,
			includeArchived
		);

		return records.map(toPersistedAccount);
	};

	const create = async (
		userId: string,
		input: CreateAccountInput
	): Promise<PersistedAccount> => {
		const household = await dependencies.householdResolver.requireForUser(userId);
		const timestamp = now();
		const record = await dependencies.accountRepository.insert({
			...input,
			id: createId(),
			householdId: household.id,
			archivedAt: null,
			createdAt: timestamp,
			createdByUserId: userId,
			updatedAt: timestamp,
			version: 1
		});

		return toPersistedAccount(record);
	};

	const update = async (
		userId: string,
		input: UpdateAccountInput
	): Promise<PersistedAccount> => {
		const current = await requireCurrentAccount(userId, input.id);

		assertVersion(current.record, input.version);

		const accountValues = {
			color: input.color,
			currency: input.currency,
			description: input.description,
			initialBalanceMinor: input.initialBalanceMinor,
			isColorAccentEnabled: input.isColorAccentEnabled,
			isIncludedInFamilyTotal: input.isIncludedInFamilyTotal,
			name: input.name,
			type: input.type,
			updatedAt: now()
		};
		const currencyChanges = current.record.currency !== input.currency;

		if (
			currencyChanges
			&& await dependencies.accountCurrencyCorrector.hasOperations(
				current.household.id,
				current.record.id
			)
		) {
			if (!input.confirmCurrencyCorrection) {
				throw new AccountCurrencyCorrectionRequiredError();
			}

			const correctedRecord = await dependencies.accountCurrencyCorrector
				.correct({
					accountId: current.record.id,
					accountValues,
					expectedVersion: input.version,
					householdBaseCurrency: current.household.baseCurrency,
					householdId: current.household.id,
					updatedByUserId: userId
				});

			if (correctedRecord !== undefined) {
				return toPersistedAccount(correctedRecord);
			}
		}

		const updatedRecord = await dependencies.accountRepository.update(
			current.household.id,
			input.id,
			input.version,
			accountValues
		);

		if (updatedRecord) {
			return toPersistedAccount(updatedRecord);
		}

		throw new AccountVersionConflictError();
	};

	const changeArchiveState = async (
		userId: string,
		input: ChangeAccountArchiveStateInput,
		archived: boolean
	): Promise<PersistedAccount> => {
		const current = await requireCurrentAccount(userId, input.id);

		assertVersion(current.record, input.version);

		const alreadyInTargetState = archived
			? current.record.archivedAt !== null
			: current.record.archivedAt === null;

		if (alreadyInTargetState) {
			return toPersistedAccount(current.record);
		}

		const timestamp = now();
		const updatedRecord = await dependencies.accountRepository.setArchivedAt(
			current.household.id,
			input.id,
			input.version,
			archived ? timestamp : null,
			timestamp
		);

		if (updatedRecord) {
			return toPersistedAccount(updatedRecord);
		}

		throw new AccountVersionConflictError();
	};

	const archive = (
		userId: string,
		input: ChangeAccountArchiveStateInput
	): Promise<PersistedAccount> => changeArchiveState(userId, input, true);

	const restore = (
		userId: string,
		input: ChangeAccountArchiveStateInput
	): Promise<PersistedAccount> => changeArchiveState(userId, input, false);

	return {
		archive,
		create,
		list,
		restore,
		update
	};
}

/**
 * Converts database timestamps to the serializable account API shape.
 */
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
