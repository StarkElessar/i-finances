import {
	convertCurrency,
	CurrencyCode,
	type CurrencyCodeValue,
	type CurrencyExchangeRates
} from '~/shared/lib';

import type { OperationType } from './types';

/**
 * Minimal operation shape for summary FX recalculation at today’s rates.
 */
export type SummaryFxOperation = {
	amountMinor: number;
	currency: CurrencyCodeValue;
	type: OperationType;
};

/**
 * Period totals in household base plus optional USD secondary at today’s rates.
 */
export type SummaryPeriodFxTotals = {
	baseCurrency: CurrencyCodeValue;
	baseTotalMinor: number;
	usdTotalMinor: number | undefined;
};

/**
 * Signed amount in the operation account currency.
 */
export function getSignedAccountAmountMinor(operation: SummaryFxOperation): number {
	const sign = operation.type === 'expense' ? -1 : 1;
	return sign * operation.amountMinor;
}

/**
 * Converts a signed minor amount between currencies; returns undefined on failure.
 */
function tryConvertMinor(
	amountMinor: number,
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates
): number | undefined {
	try {
		return Math.round(convertCurrency(amountMinor, fromCurrency, toCurrency, rates));
	}
	catch {
		return undefined;
	}
}

/**
 * Household-base equivalent for a foreign-currency row at today’s rates.
 * Same-currency rows return undefined (no secondary line).
 */
export function getOperationBaseEquivalentMinor(
	operation: SummaryFxOperation,
	householdBaseCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates | undefined
): number | undefined {
	if (operation.currency === householdBaseCurrency) {
		return undefined;
	}

	if (rates === undefined) {
		return undefined;
	}

	return tryConvertMinor(
		getSignedAccountAmountMinor(operation),
		operation.currency,
		householdBaseCurrency,
		rates
	);
}

/**
 * Recalculates period totals at today’s rates; undefined if a conversion is required but unavailable.
 */
export function getSummaryPeriodFxTotals(
	operations: readonly SummaryFxOperation[],
	householdBaseCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates | undefined
): SummaryPeriodFxTotals | undefined {
	let baseTotalMinor = 0;

	for (const operation of operations) {
		const signed = getSignedAccountAmountMinor(operation);

		if (operation.currency === householdBaseCurrency) {
			baseTotalMinor += signed;
			continue;
		}

		if (rates === undefined) {
			return undefined;
		}

		const converted = tryConvertMinor(
			signed,
			operation.currency,
			householdBaseCurrency,
			rates
		);

		if (converted === undefined) {
			return undefined;
		}

		baseTotalMinor += converted;
	}

	let usdTotalMinor: number | undefined;

	if (householdBaseCurrency !== CurrencyCode.USD) {
		if (rates !== undefined) {
			usdTotalMinor = tryConvertMinor(
				baseTotalMinor,
				householdBaseCurrency,
				CurrencyCode.USD,
				rates
			);
		}
	}

	return {
		baseCurrency: householdBaseCurrency,
		baseTotalMinor,
		usdTotalMinor
	};
}
