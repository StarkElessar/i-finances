import type { AppDatabase } from '@/infrastructure/database/client';
import { accounts } from '@/infrastructure/database/schema';

import type { AccountType, CurrencyCode } from '@i-finances/contracts';
import {
	and,
	asc,
	eq,
	isNull,
	sql
} from 'drizzle-orm';

export type AccountRecord = {
	archivedAt: Date | null;
	color: string;
	createdAt: Date;
	createdByUserId: string;
	currency: CurrencyCode;
	description: string;
	householdId: string;
	id: string;
	initialBalanceMinor: number;
	isColorAccentEnabled: boolean;
	isIncludedInFamilyTotal: boolean;
	name: string;
	type: AccountType;
	updatedAt: Date;
	version: number;
};

export type NewAccountRecord = Omit<AccountRecord, 'version'> & {
	version?: number;
};

export type AccountUpdateValues = {
	color: string;
	currency: CurrencyCode;
	description: string;
	initialBalanceMinor: number;
	isColorAccentEnabled: boolean;
	isIncludedInFamilyTotal: boolean;
	name: string;
	type: AccountType;
	updatedAt: Date;
};

function mapAccount(record: typeof accounts.$inferSelect): AccountRecord {
	return {
		archivedAt: record.archivedAt,
		color: record.color,
		createdAt: record.createdAt,
		createdByUserId: record.createdByUserId,
		currency: record.currency,
		description: record.description,
		householdId: record.householdId,
		id: record.id,
		initialBalanceMinor: record.initialBalanceMinor,
		isColorAccentEnabled: record.isColorAccentEnabled,
		isIncludedInFamilyTotal: record.isIncludedInFamilyTotal,
		name: record.name,
		type: record.type,
		updatedAt: record.updatedAt,
		version: record.version
	};
}

/**
 * Persists accounts while applying the household scope to every operation.
 */
export class AccountRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findById(
		householdId: string,
		accountId: string
	): Promise<AccountRecord | undefined> {
		const record = this.database.select()
			.from(accounts)
			.where(and(
				eq(accounts.householdId, householdId),
				eq(accounts.id, accountId)
			))
			.limit(1)
			.get();

		return record === undefined ? undefined : mapAccount(record);
	}

	public async insert(record: NewAccountRecord): Promise<AccountRecord> {
		const createdAccount = this.database.insert(accounts)
			.values(record)
			.returning()
			.get();

		return mapAccount(createdAccount);
	}

	public async list(
		householdId: string,
		includeArchived: boolean
	): Promise<AccountRecord[]> {
		const householdCondition = eq(accounts.householdId, householdId);
		const where = includeArchived
			? householdCondition
			: and(householdCondition, isNull(accounts.archivedAt));
		const records = await this.database.select()
			.from(accounts)
			.where(where)
			.orderBy(
				asc(accounts.createdAt),
				asc(accounts.name),
				asc(accounts.id)
			);

		return records.map(mapAccount);
	}

	public async setArchivedAt(
		householdId: string,
		accountId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<AccountRecord | undefined> {
		const updatedAccount = this.database.update(accounts)
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
			.returning()
			.get() as typeof accounts.$inferSelect | undefined;

		return updatedAccount === undefined ? undefined : mapAccount(updatedAccount);
	}

	public async update(
		householdId: string,
		accountId: string,
		expectedVersion: number,
		values: AccountUpdateValues
	): Promise<AccountRecord | undefined> {
		const updatedAccount = this.database.update(accounts)
			.set({
				...values,
				version: sql`${accounts.version} + 1`
			})
			.where(and(
				eq(accounts.householdId, householdId),
				eq(accounts.id, accountId),
				eq(accounts.version, expectedVersion)
			))
			.returning()
			.get() as typeof accounts.$inferSelect | undefined;

		return updatedAccount === undefined ? undefined : mapAccount(updatedAccount);
	}
}
