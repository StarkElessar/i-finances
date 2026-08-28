import type { Transfer } from '~/entities/transfer/model/types';

import type {
	OperationRecord,
	TransferRecord
} from '~/server/db/schema';

/**
 * Maps persisted transfer and linked operation ids to the public DTO.
 */
export function toTransfer(
	record: TransferRecord,
	legs: {
		fromOperationId: string;
		toOperationId: string;
	},
	contactName?: string | null
): Transfer {
	return {
		comment: record.comment,
		contactId: record.contactId,
		contactName: contactName ?? record.contactNameSnapshot,
		createdAt: record.createdAt.toISOString(),
		deletedAt: record.deletedAt?.toISOString() ?? null,
		deletedByUserId: record.deletedByUserId,
		exchangeFromCurrency: record.exchangeFromCurrency,
		exchangeRate: record.exchangeRate,
		exchangeToCurrency: record.exchangeToCurrency,
		fromAccountId: record.fromAccountId,
		fromAmountMinor: record.fromAmountMinor,
		fromOperationId: legs.fromOperationId,
		happenedOn: record.happenedOn,
		id: record.id,
		toAccountId: record.toAccountId,
		toAmountMinor: record.toAmountMinor,
		toOperationId: legs.toOperationId,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}

/**
 * Resolves from/to operation ids from the linked ledger rows.
 */
export function resolveTransferLegIds(
	legs: readonly OperationRecord[]
): {
	fromOperationId: string;
	toOperationId: string;
} {
	const expense = legs.find((leg) => leg.type === 'expense');
	const income = legs.find((leg) => leg.type === 'income');

	if (expense === undefined || income === undefined) {
		throw new Error('Transfer is missing linked ledger operations.');
	}

	return {
		fromOperationId: expense.id,
		toOperationId: income.id
	};
}
