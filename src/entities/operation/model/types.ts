import type { CurrencyCodeValue } from '~/shared/lib';

export type OperationType = 'expense' | 'income';

/**
 * Editable values accepted from the operation form.
 *
 * Currency and conversion data are intentionally absent: the server derives
 * them from the fixed account and the historical exchange-rate table.
 */
export type OperationDraft = {
	amountMinor: number;
	categoryId: string | null;
	comment: string;
	contactId: string | null;
	happenedOn: string;
	title: string;
	type: OperationType;
};

/**
 * Immutable exchange-rate snapshot used to preserve historical conversions.
 */
export type OperationExchangeRate = {
	effectiveOn: string;
	fromCurrency: CurrencyCodeValue;
	rate: string;
	source: string;
	toCurrency: CurrencyCodeValue;
};

export type Operation = {
	accountId: string;
	amountInHouseholdBaseCurrencyMinor: number;
	amountMinor: number;
	categoryId: string | null;
	categoryName: string | null;
	comment: string;
	contactId: string | null;
	contactName: string | null;
	createdAt: string;
	currency: CurrencyCodeValue;
	deletedAt: string | null;
	deletedByUserId: string | null;
	exchangeRate: OperationExchangeRate;
	happenedOn: string;
	householdBaseCurrency: CurrencyCodeValue;
	id: string;
	sourceOrder: number;
	title: string;
	transferId: string | null;
	type: OperationType;
	updatedAt: string;
	version: number;
};

export type OperationWithBalance = Operation & {
	balanceAfterMinor: number;
	signedAmountMinor: number;
};

export type AccountLedger = {
	accountCurrency: CurrencyCodeValue;
	accountId: string;
	closingBalanceMinor: number;
	householdBaseCurrency: CurrencyCodeValue;
	items: OperationWithBalance[];
	openingBalanceMinor: number;
	range: {
		end: string;
		start: string;
	};
};

export type AccountBalance = {
	accountId: string;
	balanceMinor: number;
	currency: CurrencyCodeValue;
};

export type MonthlyExpenseSummary = {
	baseCurrency: CurrencyCodeValue;
	categoryExpensesMinor: Record<string, number>;
	contactExpensesMinor: Record<string, number>;
	month: string;
};
