import { type AppDatabase, db } from '~/server/db/client';
import type {
	NewOperationRecord,
	OperationRecord
} from '~/server/db/schema';
import {
	accounts,
	categories,
	contacts,
	operations
} from '~/server/db/schema';

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

export type OperationLedgerRow = {
	categoryName: string | null;
	contactName: string | null;
	operation: OperationRecord;
};

export type CategoryOperationRow = {
	accountName: string;
	categoryName: string | null;
	contactName: string | null;
	operation: OperationRecord;
};

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

export type ReferenceExpenseTotal = {
	referenceId: string;
	totalMinor: number;
};

export type OperationRepository = {
	findById: (
		householdId: string,
		operationId: string
	) => Promise<OperationRecord | undefined>;
	getSignedTotalsByAccount: (
		householdId: string,
		accountIds: readonly string[]
	) => Promise<ReadonlyMap<string, number>>;
	getSignedTotalBefore: (
		householdId: string,
		accountId: string,
		beforeDate: string
	) => Promise<number>;
	hasForAccount: (
		householdId: string,
		accountId: string
	) => Promise<boolean>;
	insert: (
		record: Omit<NewOperationRecord, 'sourceOrder'>
	) => Promise<OperationRecord>;
	listByAccount: (
		householdId: string,
		accountId: string
	) => Promise<OperationRecord[]>;
	listByCategory: (
		householdId: string,
		categoryId: string,
		start: string,
		end: string
	) => Promise<CategoryOperationRow[]>;
	listByContact: (
		householdId: string,
		contactId: string,
		start: string,
		end: string
	) => Promise<CategoryOperationRow[]>;
	listLedger: (
		householdId: string,
		accountId: string,
		start: string,
		end: string
	) => Promise<OperationLedgerRow[]>;
	listMonthlyCategoryExpenses: (
		householdId: string,
		start: string,
		end: string
	) => Promise<ReferenceExpenseTotal[]>;
	listMonthlyContactExpenses: (
		householdId: string,
		start: string,
		end: string
	) => Promise<ReferenceExpenseTotal[]>;
	setDeletedAt: (
		householdId: string,
		operationId: string,
		expectedVersion: number,
		deletedAt: Date | null,
		deletedByUserId: string | null,
		updatedAt: Date,
		updatedByUserId: string
	) => Promise<OperationRecord | undefined>;
	update: (
		householdId: string,
		operationId: string,
		expectedVersion: number,
		values: OperationUpdateValues
	) => Promise<OperationRecord | undefined>;
};

/**
 * Creates the SQLite persistence adapter for ledger operations.
 */
export function createOperationRepository(
	database: AppDatabase = db
): OperationRepository {
	const findById = async (
		householdId: string,
		operationId: string
	): Promise<OperationRecord | undefined> => {
		return database.select()
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.id, operationId)
			))
			.limit(1)
			.get();
	};

	const insert = async (
		record: Omit<NewOperationRecord, 'sourceOrder'>
	): Promise<OperationRecord> => {
		return database.transaction((transaction) => {
			const sourceOrder = getLeadingSourceOrder(
				transaction,
				record.accountId,
				record.happenedOn
			);

			return transaction.insert(operations)
				.values({
					...record,
					sourceOrder
				})
				.returning()
				.get();
		});
	};

	const update = async (
		householdId: string,
		operationId: string,
		expectedVersion: number,
		values: OperationUpdateValues
	): Promise<OperationRecord | undefined> => {
		return database.transaction((transaction) => {
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
				: getLeadingSourceOrder(
					transaction,
					current.accountId,
					values.happenedOn
				);

			return transaction.update(operations)
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
				.get();
		});
	};

	const setDeletedAt = async (
		householdId: string,
		operationId: string,
		expectedVersion: number,
		deletedAt: Date | null,
		deletedByUserId: string | null,
		updatedAt: Date,
		updatedByUserId: string
	): Promise<OperationRecord | undefined> => {
		return database.update(operations)
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
			.get();
	};

	const listLedger = async (
		householdId: string,
		accountId: string,
		start: string,
		end: string
	): Promise<OperationLedgerRow[]> => {
		return database.select({
			categoryName: categories.name,
			contactName: contacts.name,
			operation: operations
		})
			.from(operations)
			.leftJoin(categories, eq(categories.id, operations.categoryId))
			.leftJoin(contacts, eq(contacts.id, operations.contactId))
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId),
				isNull(operations.deletedAt),
				gte(operations.happenedOn, start),
				lte(operations.happenedOn, end)
			))
			.orderBy(
				asc(operations.happenedOn),
				asc(operations.sourceOrder)
			);
	};

	/**
	 * Lists non-deleted operations for a category in a closed date range.
	 * Newest days first; within a day, newer inserts (lower sourceOrder) first.
	 */
	const listByCategory = async (
		householdId: string,
		categoryId: string,
		start: string,
		end: string
	): Promise<CategoryOperationRow[]> => {
		return listByReference(
			database,
			householdId,
			operations.categoryId,
			categoryId,
			start,
			end
		);
	};

	/**
	 * Lists non-deleted operations for a contact in a closed date range.
	 * Newest days first; within a day, newer inserts (lower sourceOrder) first.
	 */
	const listByContact = async (
		householdId: string,
		contactId: string,
		start: string,
		end: string
	): Promise<CategoryOperationRow[]> => {
		return listByReference(
			database,
			householdId,
			operations.contactId,
			contactId,
			start,
			end
		);
	};

	const getSignedTotalBefore = async (
		householdId: string,
		accountId: string,
		beforeDate: string
	): Promise<number> => {
		const result = database.select({
			total: sql<number>`
				coalesce(sum(
					case
						when ${operations.type} = 'expense'
							then -${operations.amountMinor}
						else ${operations.amountMinor}
					end
				), 0)
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
	};

	const getSignedTotalsByAccount = async (
		householdId: string,
		accountIds: readonly string[]
	): Promise<ReadonlyMap<string, number>> => {
		if (accountIds.length === 0) {
			return new Map();
		}

		const rows = await database.select({
			accountId: operations.accountId,
			total: sql<number>`
				coalesce(sum(
					case
						when ${operations.type} = 'expense'
							then -${operations.amountMinor}
						else ${operations.amountMinor}
					end
				), 0)
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
	};

	const hasForAccount = async (
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

	const listByAccount = async (
		householdId: string,
		accountId: string
	): Promise<OperationRecord[]> => {
		return database.select()
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.accountId, accountId)
			))
			.orderBy(
				asc(operations.happenedOn),
				asc(operations.sourceOrder)
			);
	};

	const listMonthlyCategoryExpenses = (
		householdId: string,
		start: string,
		end: string
	): Promise<ReferenceExpenseTotal[]> => {
		return listMonthlyReferenceExpenses(
			database,
			householdId,
			start,
			end,
			operations.categoryId
		);
	};

	const listMonthlyContactExpenses = (
		householdId: string,
		start: string,
		end: string
	): Promise<ReferenceExpenseTotal[]> => {
		return listMonthlyReferenceExpenses(
			database,
			householdId,
			start,
			end,
			operations.contactId
		);
	};

	return {
		findById,
		getSignedTotalBefore,
		getSignedTotalsByAccount,
		hasForAccount,
		insert,
		listByAccount,
		listByCategory,
		listByContact,
		listLedger,
		listMonthlyCategoryExpenses,
		listMonthlyContactExpenses,
		setDeletedAt,
		update
	};
}

type TransactionDatabase = Parameters<AppDatabase['transaction']>[0] extends (
	transaction: infer T
) => unknown ? T : never;

function getLeadingSourceOrder(
	transaction: TransactionDatabase,
	accountId: string,
	happenedOn: string
): number {
	const result = transaction.select({
		sourceOrder: sql<number | null>`min(${operations.sourceOrder})`
			.mapWith(Number)
	})
		.from(operations)
		.where(and(
			eq(operations.accountId, accountId),
			eq(operations.happenedOn, happenedOn)
		))
		.get();

	return (result?.sourceOrder ?? 0) - 1;
}

/**
 * Lists non-deleted operations for a category or contact reference in a date range.
 */
function listByReference(
	database: AppDatabase,
	householdId: string,
	referenceColumn: typeof operations.categoryId | typeof operations.contactId,
	referenceId: string,
	start: string,
	end: string
): Promise<CategoryOperationRow[]> {
	return database.select({
		accountName: accounts.name,
		categoryName: categories.name,
		contactName: contacts.name,
		operation: operations
	})
		.from(operations)
		.innerJoin(accounts, eq(accounts.id, operations.accountId))
		.leftJoin(categories, eq(categories.id, operations.categoryId))
		.leftJoin(contacts, eq(contacts.id, operations.contactId))
		.where(and(
			eq(operations.householdId, householdId),
			eq(referenceColumn, referenceId),
			isNull(operations.deletedAt),
			gte(operations.happenedOn, start),
			lte(operations.happenedOn, end)
		))
		.orderBy(
			desc(operations.happenedOn),
			asc(operations.sourceOrder)
		);
}

function listMonthlyReferenceExpenses(
	database: AppDatabase,
	householdId: string,
	start: string,
	end: string,
	referenceColumn: typeof operations.categoryId | typeof operations.contactId
): Promise<ReferenceExpenseTotal[]> {
	return database.select({
		referenceId: referenceColumn,
		totalMinor: sql<number>`
			sum(${operations.amountInHouseholdBaseCurrencyMinor})
		`.mapWith(Number)
	})
		.from(operations)
		.where(and(
			eq(operations.householdId, householdId),
			eq(operations.type, 'expense'),
			isNull(operations.deletedAt),
			isNull(operations.transferId),
			isNotNull(referenceColumn),
			gte(operations.happenedOn, start),
			lte(operations.happenedOn, end)
		))
		.groupBy(referenceColumn) as Promise<ReferenceExpenseTotal[]>;
}
