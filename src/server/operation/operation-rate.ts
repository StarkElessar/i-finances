import { OperationConversionAmountError } from './operation-errors';

import type { ExchangeRateQuote } from '~/entities/exchange-rate';
import type { OperationRecord } from '~/server/db/schema';
import {
	convertMinorUnitsByExchangeRate,
	type CurrencyCodeValue
} from '~/shared/lib';

export type OperationRateSnapshot = {
	amountInHouseholdBaseCurrencyMinor: number;
	quote: ExchangeRateQuote;
};

/**
 * Converts an operation amount using the authoritative resolved quote.
 */
export function createOperationRateSnapshot(
	amountMinor: number,
	quote: ExchangeRateQuote,
	expectedFromCurrency: CurrencyCodeValue,
	expectedToCurrency: CurrencyCodeValue
): OperationRateSnapshot {
	if (
		quote.fromCurrency !== expectedFromCurrency
		|| quote.toCurrency !== expectedToCurrency
	) {
		throw new Error('Exchange-rate resolver returned an unexpected pair.');
	}

	const convertedAmount = convertMinorUnitsByExchangeRate(
		amountMinor,
		quote.rate
	);

	if (convertedAmount <= 0) {
		throw new OperationConversionAmountError();
	}

	return {
		amountInHouseholdBaseCurrencyMinor: convertedAmount,
		quote
	};
}

/**
 * Restores the immutable exchange-rate quote stored on an operation row.
 */
export function getStoredOperationQuote(
	operation: OperationRecord
): ExchangeRateQuote {
	return {
		effectiveOn: operation.exchangeRateEffectiveOn,
		fromCurrency: operation.currency,
		rate: operation.exchangeRate,
		source: operation.exchangeRateSource,
		toCurrency: operation.householdBaseCurrency
	};
}
