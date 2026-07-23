import { randomUUID } from 'node:crypto';

import type { AccountRepository } from './account-repository';

import type {
    ChangeAccountArchiveStateInput,
    CreateAccountInput,
    UpdateAccountInput
} from '~/entities/account/api/account.contract';
import type { PersistedAccount } from '~/entities/account/model/types';
import type { AccountRecord } from '~/server/db/schema';
import type { HouseholdResolver } from '~/server/household/household-service';

/**
 * Signals that the requested account is not part of the active household.
 */
export class AccountNotFoundError extends Error {
    constructor() {
        super('Account not found.');
        this.name = 'AccountNotFoundError';
    }
}

/**
 * Signals that an account changed after the client loaded it.
 */
export class AccountVersionConflictError extends Error {
    constructor() {
        super('Account version conflict.');
        this.name = 'AccountVersionConflictError';
    }
}

export type AccountServiceDependencies = {
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
    ): Promise<{ householdId: string; record: AccountRecord }> => {
        const household = await dependencies.householdResolver.requireForUser(userId);
        const record = await dependencies.accountRepository.findById(
            household.id,
            accountId
        );

        if (record) {
            return {
                householdId: household.id,
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

        const updatedRecord = await dependencies.accountRepository.update(
            current.householdId,
            input.id,
            input.version,
            {
                color: input.color,
                currency: input.currency,
                description: input.description,
                initialBalanceMinor: input.initialBalanceMinor,
                isColorAccentEnabled: input.isColorAccentEnabled,
                isIncludedInFamilyTotal: input.isIncludedInFamilyTotal,
                name: input.name,
                type: input.type,
                updatedAt: now()
            }
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
            current.householdId,
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
