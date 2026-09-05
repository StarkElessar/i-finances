import {
	convertMinorUnitsByExchangeRate,
	type ExchangeRateQuote
} from '@/modules/exchange-rate';

import type { CurrencyCode, OperationExchangeRate } from '@i-finances/contracts';

import { OperationConversionAmountError } from './operation-errors';
import type { OperationRecord } from './operation-repository';

export type OperationRateSnapshot = {
	amountInHouseholdBaseCurrencyMinor: number;
	quote: ExchangeRateQuote;
};

export function createOperationRateSnapshot(
	amountMinor: number,
	quote: ExchangeRateQuote,
	expectedFromCurrency: CurrencyCode,
	expectedToCurrency: CurrencyCode
): OperationRateSnapshot {
	if (quote.fromCurrency !== expectedFromCurrency || quote.toCurrency !== expectedToCurrency) {
		throw new Error('Exchange-rate resolver returned an unexpected pair.');
	}

	const convertedAmount = convertMinorUnitsByExchangeRate(amountMinor, quote.rate);

	if (convertedAmount <= 0) {
		throw new OperationConversionAmountError();
	}

	return { amountInHouseholdBaseCurrencyMinor: convertedAmount, quote };
}

export function getStoredOperationQuote(record: OperationRecord): OperationExchangeRate {
	return {
		effectiveOn: record.exchangeRateEffectiveOn,
		fromCurrency: record.currency,
		rate: record.exchangeRate,
		source: record.exchangeRateSource,
		toCurrency: record.householdBaseCurrency
	};
}
