import { type AppDatabase, db } from '~/server/db/client';
import type {
	NewOperationRecord,
	NewTransferRecord,
	OperationRecord,
	TransferRecord
} from '~/server/db/schema';
import {
	operations,
	transfers
} from '~/server/db/schema';

import {
	and,
	asc,
	eq,
	sql
} from 'drizzle-orm';

export type TransferLegInsert = Omit<NewOperationRecord, 'sourceOrder'>;

export type TransferUpdateValues = Pick<
	TransferRecord,
	| 'comment'
	| 'contactId'
	| 'contactNameSnapshot'
	| 'exchangeFromCurrency'
	| 'exchangeRate'
	| 'exchangeToCurrency'
	| 'fromAccountId'
	| 'fromAmountMinor'
	| 'happenedOn'
	| 'toAccountId'
	| 'toAmountMinor'
	| 'updatedAt'
	| 'updatedByUserId'
>;

export type TransferWithLegs = {
	legs: OperationRecord[];
	transfer: TransferRecord;
};

export type TransferRepository = {
	findById: (
		householdId: string,
		transferId: string
	) => Promise<TransferWithLegs | undefined>;
	insertWithLegs: (
		transfer: NewTransferRecord,
		fromLeg: TransferLegInsert,
		toLeg: TransferLegInsert
	) => Promise<TransferWithLegs>;
	setDeletedAt: (
		householdId: string,
		transferId: string,
		expectedVersion: number,
		deletedAt: Date | null,
		deletedByUserId: string | null,
		updatedAt: Date,
		updatedByUserId: string
	) => Promise<TransferWithLegs | undefined>;
	updateWithLegs: (
		householdId: string,
		transferId: string,
		expectedVersion: number,
		values: TransferUpdateValues,
		fromLeg: TransferLegInsert,
		toLeg: TransferLegInsert
	) => Promise<TransferWithLegs | undefined>;
};

/**
 * Creates the SQLite persistence adapter for transfers and linked ledger legs.
 */
export function createTransferRepository(
	database: AppDatabase = db
): TransferRepository {
	const findById = async (
		householdId: string,
		transferId: string
	): Promise<TransferWithLegs | undefined> => {
		const transfer = database.select()
			.from(transfers)
			.where(and(
				eq(transfers.householdId, householdId),
				eq(transfers.id, transferId)
			))
			.limit(1)
			.get();

		if (transfer === undefined) {
			return undefined;
		}

		const legs = database.select()
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.transferId, transferId)
			))
			.orderBy(asc(operations.type))
			.all();

		return {
			legs,
			transfer
		};
	};

	const insertWithLegs = async (
		transfer: NewTransferRecord,
		fromLeg: TransferLegInsert,
		toLeg: TransferLegInsert
	): Promise<TransferWithLegs> => {
		return database.transaction((transaction) => {
			const createdTransfer = transaction.insert(transfers)
				.values(transfer)
				.returning()
				.get();
			const createdFromLeg = insertOperationLeg(transaction, fromLeg);
			const createdToLeg = insertOperationLeg(transaction, toLeg);

			return {
				legs: [createdFromLeg, createdToLeg],
				transfer: createdTransfer
			};
		});
	};

	const updateWithLegs = async (
		householdId: string,
		transferId: string,
		expectedVersion: number,
		values: TransferUpdateValues,
		fromLeg: TransferLegInsert,
		toLeg: TransferLegInsert
	): Promise<TransferWithLegs | undefined> => {
		return database.transaction((transaction) => {
			const updatedTransfer = transaction.update(transfers)
				.set({
					...values,
					version: sql`${transfers.version} + 1`
				})
				.where(and(
					eq(transfers.householdId, householdId),
					eq(transfers.id, transferId),
					eq(transfers.version, expectedVersion),
					sql`${transfers.deletedAt} is null`
				))
				.returning()
				.get() as TransferRecord | undefined;

			if (updatedTransfer === undefined) {
				return undefined;
			}

			const existingLegs = transaction.select()
				.from(operations)
				.where(and(
					eq(operations.householdId, householdId),
					eq(operations.transferId, transferId),
					sql`${operations.deletedAt} is null`
				))
				.all();
			const expense = existingLegs.find((leg) => leg.type === 'expense');
			const income = existingLegs.find((leg) => leg.type === 'income');

			if (expense === undefined || income === undefined) {
				throw new Error('Transfer is missing linked ledger operations.');
			}

			const updatedFromLeg = replaceOperationLeg(
				transaction,
				expense,
				fromLeg
			);
			const updatedToLeg = replaceOperationLeg(
				transaction,
				income,
				toLeg
			);

			return {
				legs: [updatedFromLeg, updatedToLeg],
				transfer: updatedTransfer
			};
		});
	};

	const setDeletedAt = async (
		householdId: string,
		transferId: string,
		expectedVersion: number,
		deletedAt: Date | null,
		deletedByUserId: string | null,
		updatedAt: Date,
		updatedByUserId: string
	): Promise<TransferWithLegs | undefined> => {
		return database.transaction((transaction) => {
			const updatedTransfer = transaction.update(transfers)
				.set({
					deletedAt,
					deletedByUserId,
					updatedAt,
					updatedByUserId,
					version: sql`${transfers.version} + 1`
				})
				.where(and(
					eq(transfers.householdId, householdId),
					eq(transfers.id, transferId),
					eq(transfers.version, expectedVersion)
				))
				.returning()
				.get() as TransferRecord | undefined;

			if (updatedTransfer === undefined) {
				return undefined;
			}

			transaction.update(operations)
				.set({
					deletedAt,
					deletedByUserId,
					updatedAt,
					updatedByUserId,
					version: sql`${operations.version} + 1`
				})
				.where(and(
					eq(operations.householdId, householdId),
					eq(operations.transferId, transferId)
				))
				.run();

			const legs = transaction.select()
				.from(operations)
				.where(and(
					eq(operations.householdId, householdId),
					eq(operations.transferId, transferId)
				))
				.all();

			return {
				legs,
				transfer: updatedTransfer
			};
		});
	};

	return {
		findById,
		insertWithLegs,
		setDeletedAt,
		updateWithLegs
	};
}

type TransactionDatabase = Parameters<AppDatabase['transaction']>[0] extends (
	transaction: infer T
) => unknown ? T : never;

function insertOperationLeg(
	transaction: TransactionDatabase,
	record: TransferLegInsert
): OperationRecord {
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
}

function replaceOperationLeg(
	transaction: TransactionDatabase,
	current: OperationRecord,
	values: TransferLegInsert
): OperationRecord {
	const sourceOrder = current.accountId === values.accountId
		&& current.happenedOn === values.happenedOn
		? current.sourceOrder
		: getLeadingSourceOrder(
			transaction,
			values.accountId,
			values.happenedOn
		);

	return transaction.update(operations)
		.set({
			...values,
			sourceOrder,
			version: sql`${operations.version} + 1`
		})
		.where(and(
			eq(operations.householdId, current.householdId),
			eq(operations.id, current.id)
		))
		.returning()
		.get();
}

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
