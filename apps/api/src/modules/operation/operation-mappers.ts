import type { PersistedOperation } from '@i-finances/contracts';

import type { OperationRecord } from './operation-repository';

export type OperationReferenceNames = {
	categoryName?: string | null;
	contactName?: string | null;
};

export function toPersistedOperation(
	record: OperationRecord,
	referenceNames: OperationReferenceNames = {}
): PersistedOperation {
	return {
		accountId: record.accountId,
		amountInHouseholdBaseCurrencyMinor: record.amountInHouseholdBaseCurrencyMinor,
		amountMinor: record.amountMinor,
		categoryId: record.categoryId,
		categoryName: referenceNames.categoryName ?? record.categoryNameSnapshot,
		comment: record.comment,
		contactId: record.contactId,
		contactName: referenceNames.contactName ?? record.contactNameSnapshot,
		createdAt: record.createdAt.toISOString(),
		currency: record.currency,
		deletedAt: record.deletedAt?.toISOString() ?? null,
		deletedByUserId: record.deletedByUserId,
		exchangeRate: {
			effectiveOn: record.exchangeRateEffectiveOn,
			fromCurrency: record.currency,
			rate: record.exchangeRate,
			source: record.exchangeRateSource,
			toCurrency: record.householdBaseCurrency
		},
		happenedOn: record.happenedOn,
		householdBaseCurrency: record.householdBaseCurrency,
		id: record.id,
		sourceOrder: record.sourceOrder,
		title: record.title,
		transferId: record.transferId,
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}
