import type { Operation } from '~/entities/operation/model/types';
import type { OperationRecord } from '~/server/db/schema';

export type OperationReferenceNames = {
	categoryName?: string | null;
	contactName?: string | null;
};

/**
 * Converts a DB row to the canonical serializable operation DTO.
 */
export function toOperation(
	record: OperationRecord,
	referenceNames: OperationReferenceNames = {}
): Operation {
	return {
		accountId: record.accountId,
		amountInHouseholdBaseCurrencyMinor:
			record.amountInHouseholdBaseCurrencyMinor,
		amountMinor: record.amountMinor,
		categoryId: record.categoryId,
		categoryName: referenceNames.categoryName
			?? record.categoryNameSnapshot,
		comment: record.comment,
		contactId: record.contactId,
		contactName: referenceNames.contactName
			?? record.contactNameSnapshot,
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
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}
