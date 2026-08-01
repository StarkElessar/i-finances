import {
	and,
	asc,
	eq,
	isNull,
	sql
} from 'drizzle-orm';

import { type AppDatabase, db } from '~/server/db/client';
import type {
	AccountRecord,
	NewAccountRecord
} from '~/server/db/schema';
import { accounts } from '~/server/db/schema';
import type {
	AccountTypeValue,
	CurrencyCodeValue
} from '~/shared/lib';

export type AccountUpdateValues = {
	color: string;
	currency: CurrencyCodeValue;
	description: string;
	initialBalanceMinor: number;
	isColorAccentEnabled: boolean;
	isIncludedInFamilyTotal: boolean;
	name: string;
	type: AccountTypeValue;
	updatedAt: Date;
};

export type AccountRepository = {
	findById: (
		householdId: string,
		accountId: string
	) => Promise<AccountRecord | undefined>;
	insert: (record: NewAccountRecord) => Promise<AccountRecord>;
	list: (
		householdId: string,
		includeArchived: boolean
	) => Promise<AccountRecord[]>;
	setArchivedAt: (
		householdId: string,
		accountId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	) => Promise<AccountRecord | undefined>;
	update: (
		householdId: string,
		accountId: string,
		expectedVersion: number,
		values: AccountUpdateValues
	) => Promise<AccountRecord | undefined>;
};

/**
 * Creates an account repository that scopes every read and write by household.
 */
export function createAccountRepository(
	database: AppDatabase = db
): AccountRepository {
	const findById = async (
		householdId: string,
		accountId: string
	): Promise<AccountRecord | undefined> => {
		const [record] = await database.select()
			.from(accounts)
			.where(and(
				eq(accounts.householdId, householdId),
				eq(accounts.id, accountId)
			))
			.limit(1);

		return record;
	};

	const insert = async (record: NewAccountRecord): Promise<AccountRecord> => {
		const [createdAccount] = await database.insert(accounts)
			.values(record)
			.returning();

		return createdAccount;
	};

	const list = async (
		householdId: string,
		includeArchived: boolean
	): Promise<AccountRecord[]> => {
		const householdCondition = eq(accounts.householdId, householdId);
		const where = includeArchived
			? householdCondition
			: and(householdCondition, isNull(accounts.archivedAt));

		return database.select()
			.from(accounts)
			.where(where)
			.orderBy(
				asc(accounts.createdAt),
				asc(accounts.name),
				asc(accounts.id)
			);
	};

	const update = async (
		householdId: string,
		accountId: string,
		expectedVersion: number,
		values: AccountUpdateValues
	): Promise<AccountRecord | undefined> => {
		const [updatedAccount] = await database.update(accounts)
			.set({
				...values,
				version: sql`${accounts.version} + 1`
			})
			.where(and(
				eq(accounts.householdId, householdId),
				eq(accounts.id, accountId),
				eq(accounts.version, expectedVersion)
			))
			.returning();

		return updatedAccount;
	};

	const setArchivedAt = async (
		householdId: string,
		accountId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<AccountRecord | undefined> => {
		const [updatedAccount] = await database.update(accounts)
			.set({
				archivedAt,
				updatedAt,
				version: sql`${accounts.version} + 1`
			})
			.where(and(
				eq(accounts.householdId, householdId),
				eq(accounts.id, accountId),
				eq(accounts.version, expectedVersion)
			))
			.returning();

		return updatedAccount;
	};

	return {
		findById,
		insert,
		list,
		setArchivedAt,
		update
	};
}
