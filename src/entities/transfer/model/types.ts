import type { CurrencyCodeValue } from '~/shared/lib';

/**
 * Canonical transfer DTO returned by transfer commands and queries.
 */
export type Transfer = {
	comment: string;
	contactId: string | null;
	contactName: string | null;
	createdAt: string;
	deletedAt: string | null;
	deletedByUserId: string | null;
	exchangeFromCurrency: CurrencyCodeValue;
	exchangeRate: string;
	exchangeToCurrency: CurrencyCodeValue;
	fromAccountId: string;
	fromAmountMinor: number;
	fromOperationId: string;
	happenedOn: string;
	id: string;
	toAccountId: string;
	toAmountMinor: number;
	toOperationId: string;
	updatedAt: string;
	version: number;
};
