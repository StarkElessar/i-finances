import type { AppDatabase } from '@/infrastructure/database/client';
import {
	accounts,
	categories,
	contacts,
	operations
} from '@/infrastructure/database/schema';

import type { CurrencyCode, OperationType } from '@i-finances/contracts';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	sql
} from 'drizzle-orm';

export type OperationRecord = {
	accountId: string;
	amountInHouseholdBaseCurrencyMinor: number;
	amountMinor: number;
	categoryId: string | null;
	categoryNameSnapshot: string | null;
	comment: string;
	contactId: string | null;
	contactNameSnapshot: string | null;
	createdAt: Date;
	createdByUserId: string;
	currency: CurrencyCode;
	deletedAt: Date | null;
	deletedByUserId: string | null;
	exchangeRate: string;
	exchangeRateEffectiveOn: string;
	exchangeRateSource: string;
	happenedOn: string;
	householdBaseCurrency: CurrencyCode;
	householdId: string;
	id: string;
	sourceOrder: number;
	title: string;
	transferId: string | null;
	type: OperationType;
	updatedAt: Date;
	updatedByUserId: string;
	version: number;
};

export type NewOperationRecord = Omit<OperationRecord, 'sourceOrder'>;

export type OperationUpdateValues = Pick<
	OperationRecord,
	| 'amountInHouseholdBaseCurrencyMinor'
	| 'amountMinor'
	| 'categoryId'
	| 'categoryNameSnapshot'
	| 'comment'
	| 'contactId'
	| 'contactNameSnapshot'
	| 'currency'
	| 'exchangeRate'
	| 'exchangeRateEffectiveOn'
	| 'exchangeRateSource'
	| 'happenedOn'
	| 'householdBaseCurrency'
	| 'title'
	| 'type'
	| 'updatedAt'
	| 'updatedByUserId'
>;

export type OperationLedgerRow = {
	categoryName: string | null;
	contactName: string | null;
	operation: OperationRecord;
};

export type OperationReferenceRow = OperationLedgerRow & {
	accountName: string;
};

export type ReferenceExpenseTotal = {
	referenceId: string;
	totalMinor: number;
};

function toOperationRecord(record: typeof operations.$inferSelect): OperationRecord {
	return {
		accountId: record.accountId,
		amountInHouseholdBaseCurrencyMinor: record.amountInHouseholdBaseCurrencyMinor,
		amountMinor: record.amountMinor,
		categoryId: record.categoryId,
		categoryNameSnapshot: record.categoryNameSnapshot,
		comment: record.comment,
		contactId: record.contactId,
		contactNameSnapshot: record.contactNameSnapshot,
		createdAt: record.createdAt,
		createdByUserId: record.createdByUserId,
		currency: record.currency,
		deletedAt: record.deletedAt,
		deletedByUserId: record.deletedByUserId,
		exchangeRate: record.exchangeRate,
		exchangeRateEffectiveOn: record.exchangeRateEffectiveOn,
		exchangeRateSource: record.exchangeRateSource,
		happenedOn: record.happenedOn,
		householdBaseCurrency: record.householdBaseCurrency,
		householdId: record.householdId,
		id: record.id,
		sourceOrder: record.sourceOrder,
		title: record.title,
		transferId: record.transferId,
		type: record.type,
		updatedAt: record.updatedAt,
		updatedByUserId: record.updatedByUserId,
		version: record.version
	};
}

/**
 * Persists operations and owns ledger-specific SQL ordering and aggregation.
 */
export class OperationRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findById(
		householdId: string,
		operationId: string
	): Promise<OperationRecord | undefined> {
		const record = this.database.select()
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.id, operationId)
			))
			.limit(1)
			.get();

		return record === undefined ? undefined : toOperationRecord(record);
	}

	public async insert(record: NewOperationRecord): Promise<OperationRecord> {
		return this.database.transaction((transaction) => {
			const sourceOrder = this.getLeadingSourceOrder(
				transaction,
				record.householdId,
				record.accountId,
				record.happenedOn
			);
			const inserted = transaction.insert(operations)
				.values({ ...record, sourceOrder })
				.returning()
				.get();

			return toOperationRecord(inserted);
		});
	}

	public async update(
		householdId: string,
		operationId: string,
		expectedVersion: number,
		values: OperationUpdateValues
	): Promise<OperationRecord | undefined> {
		return this.database.transaction((transaction) => {
			const current = transaction.select({
				accountId: operations.accountId,
				happenedOn: operations.happenedOn,
				sourceOrder: operations.sourceOrder
			})
				.from(operations)
				.where(and(
					eq(operations.householdId, householdId),
					eq(operations.id, operationId),
					eq(operations.version, expectedVersion)
				))
				.limit(1)
				.get();

			if (current === undefined) {
				return undefined;
			}

			const sourceOrder = current.happenedOn === values.happenedOn
				? current.sourceOrder
				: this.getLeadingSourceOrder(
					transaction,
					householdId,
					current.accountId,
					values.happenedOn
				);
			const updated = transaction.update(operations)
				.set({
					...values,
					sourceOrder,
					version: sql`${operations.version} + 1`
				})
				.where(and(
					eq(operations.householdId, householdId),
					eq(operations.id, operationId),
					eq(operations.version, expectedVersion)
				))
				.returning()
				.get() as typeof operations.$inferSelect | undefined;

			return updated === undefined ? undefined : toOperationRecord(updated);
		});
	}

	public async setDeletedAt(
		householdId: string,
		operationId: string,
		expectedVersion: number,
		deletedAt: Date | null,
		deletedByUserId: string | null,
		updatedAt: Date,
		updatedByUserId: string
	): Promise<OperationRecord | undefined> {
		const updated = this.database.update(operations)
			.set({
				deletedAt,
				deletedByUserId,
				updatedAt,
				updatedByUserId,
				version: sql`${operations.version} + 1`
			})
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.id, operationId),
				eq(operations.version, expectedVersion)
			))
			.returning()
			.get() as typeof operations.$inferSelect | undefined;

		return updated === undefined ? undefined : toOperationRecord(updated);
	}

	public async listLedger(
		householdId: string,
		accountId: string,
		start: string,
		end: string
	): Promise<OperationLedgerRow[]> {
		const rows = await this.database.select({
			categoryName: categories.name,
			contactName: contacts.name,
			operation: operations
		})
			.from(operations)
			.leftJoin(categories, and(
				eq(categories.id, operations.categoryId),
				eq(categories.householdId, householdId)
			))
			.leftJoin(contacts, and(
				eq(contacts.id, operations.contactId),
				eq(contacts.householdId, householdId)
			))
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId),
				isNull(operations.deletedAt),
				gte(operations.happenedOn, start),
				lte(operations.happenedOn, end)
			))
			.orderBy(asc(operations.happenedOn), asc(operations.sourceOrder));

		return rows.map((row) => ({
			categoryName: row.categoryName,
			contactName: row.contactName,
			operation: toOperationRecord(row.operation)
		}));
	}

	public listByCategory(
		householdId: string,
		categoryId: string,
		start: string,
		end: string
	): Promise<OperationReferenceRow[]> {
		return this.listByReference(householdId, operations.categoryId, categoryId, start, end);
	}

	public listByContact(
		householdId: string,
		contactId: string,
		start: string,
		end: string
	): Promise<OperationReferenceRow[]> {
		return this.listByReference(householdId, operations.contactId, contactId, start, end);
	}

	private async listByReference(
		householdId: string,
		column: SQLiteColumn,
		referenceId: string,
		start: string,
		end: string
	): Promise<OperationReferenceRow[]> {
		const rows = await this.database.select({
			accountName: accounts.name,
			categoryName: categories.name,
			contactName: contacts.name,
			operation: operations
		})
			.from(operations)
			.innerJoin(accounts, and(
				eq(accounts.id, operations.accountId),
				eq(accounts.householdId, householdId)
			))
			.leftJoin(categories, and(
				eq(categories.id, operations.categoryId),
				eq(categories.householdId, householdId)
			))
			.leftJoin(contacts, and(
				eq(contacts.id, operations.contactId),
				eq(contacts.householdId, householdId)
			))
			.where(and(
				eq(operations.householdId, householdId),
				eq(column, referenceId),
				isNull(operations.deletedAt),
				gte(operations.happenedOn, start),
				lte(operations.happenedOn, end)
			))
			.orderBy(desc(operations.happenedOn), asc(operations.sourceOrder));

		return rows.map((row) => ({
			accountName: row.accountName,
			categoryName: row.categoryName,
			contactName: row.contactName,
			operation: toOperationRecord(row.operation)
		}));
	}

	public async getSignedTotalBefore(
		householdId: string,
		accountId: string,
		beforeDate: string
	): Promise<number> {
		const result = this.database.select({
			total: sql<number>`
				coalesce(
					sum(case when ${operations.type} = 'expense' then -${operations.amountMinor} else ${operations.amountMinor} end),
					0
				)
			`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId),
				isNull(operations.deletedAt),
				lt(operations.happenedOn, beforeDate)
			))
			.get();

		return result?.total ?? 0;
	}

	public async getSignedTotalsByAccount(
		householdId: string,
		accountIds: readonly string[]
	): Promise<ReadonlyMap<string, number>> {
		if (accountIds.length === 0) {
			return new Map();
		}

		const rows = await this.database.select({
			accountId: operations.accountId,
			total: sql<number>`
				coalesce(
					sum(case when ${operations.type} = 'expense' then -${operations.amountMinor} else ${operations.amountMinor} end),
					0
				)
			`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				inArray(operations.accountId, [...accountIds]),
				isNull(operations.deletedAt)
			))
			.groupBy(operations.accountId);

		return new Map(rows.map((row) => [row.accountId, row.total]));
	}

	public async listMonthlyCategoryExpenses(
		householdId: string,
		start: string,
		end: string
	): Promise<ReferenceExpenseTotal[]> {
		return this.listMonthlyReferenceExpenses(householdId, start, end, operations.categoryId);
	}

	public async listMonthlyContactExpenses(
		householdId: string,
		start: string,
		end: string
	): Promise<ReferenceExpenseTotal[]> {
		return this.listMonthlyReferenceExpenses(householdId, start, end, operations.contactId);
	}

	private async listMonthlyReferenceExpenses(
		householdId: string,
		start: string,
		end: string,
		referenceColumn: typeof operations.categoryId | typeof operations.contactId
	): Promise<ReferenceExpenseTotal[]> {
		return this.database.select({
			referenceId: referenceColumn,
			totalMinor: sql<number>`sum(${operations.amountInHouseholdBaseCurrencyMinor})`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.type, 'expense'),
				isNull(operations.deletedAt),
				isNotNull(referenceColumn),
				gte(operations.happenedOn, start),
				lte(operations.happenedOn, end)
			))
			.groupBy(referenceColumn) as unknown as ReferenceExpenseTotal[];
	}

	private getLeadingSourceOrder(
		transaction: TransactionDatabase,
		householdId: string,
		accountId: string,
		happenedOn: string
	): number {
		const result = transaction.select({
			sourceOrder: sql<number | null>`min(${operations.sourceOrder})`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId),
				eq(operations.happenedOn, happenedOn)
			))
			.get();

		return (result?.sourceOrder ?? 0) - 1;
	}
}

type TransactionDatabase = Parameters<AppDatabase['transaction']>[0] extends (
	transaction: infer T
) => unknown ? T : never;
