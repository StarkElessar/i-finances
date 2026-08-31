import {
	type CurrencyCodeValue,
	invertExchangeRate,
	normalizeExchangeRate
} from '~/shared/lib';

/**
 * Describes how the transfer dialog interprets a manually entered rate.
 *
 * When exactly one leg uses the household base currency, the quote means
 * `1 foreign = rate base` (bank-style). Otherwise it means `1 from = rate to`.
 */
export type TransferRateQuoteMode =
	| {
		kind: 'foreign-in-base';
		baseCurrency: CurrencyCodeValue;
		foreignCurrency: CurrencyCodeValue;
	}
	| {
		kind: 'from-to';
		fromCurrency: CurrencyCodeValue;
		toCurrency: CurrencyCodeValue;
	};

/**
 * Resolves the quote mode for a transfer currency pair.
 */
export function getTransferRateQuoteMode(
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	householdBaseCurrency: CurrencyCodeValue
): TransferRateQuoteMode {
	if (fromCurrency === toCurrency) {
		throw new Error('Transfer currencies must differ.');
	}

	if (
		fromCurrency === householdBaseCurrency
		&& toCurrency !== householdBaseCurrency
	) {
		return {
			baseCurrency: householdBaseCurrency,
			foreignCurrency: toCurrency,
			kind: 'foreign-in-base'
		};
	}

	if (
		toCurrency === householdBaseCurrency
		&& fromCurrency !== householdBaseCurrency
	) {
		return {
			baseCurrency: householdBaseCurrency,
			foreignCurrency: fromCurrency,
			kind: 'foreign-in-base'
		};
	}

	return {
		fromCurrency,
		kind: 'from-to',
		toCurrency
	};
}

/**
 * Builds the rate field label for the active quote mode.
 */
export function formatTransferRateQuoteLabel(mode: TransferRateQuoteMode): string {
	if (mode.kind === 'foreign-in-base') {
		return `Курс (1 ${mode.foreignCurrency} = … ${mode.baseCurrency})`;
	}

	return `Курс (1 ${mode.fromCurrency} = … ${mode.toCurrency})`;
}

/**
 * Converts a user-facing quote into the canonical pair rate `to = from × rate`.
 */
export function toCanonicalTransferRate(
	userRate: string,
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	householdBaseCurrency: CurrencyCodeValue
): string | undefined {
	const normalizedRate = normalizeExchangeRate(userRate);

	if (normalizedRate === undefined) {
		return undefined;
	}

	const mode = getTransferRateQuoteMode(
		fromCurrency,
		toCurrency,
		householdBaseCurrency
	);

	if (
		mode.kind === 'foreign-in-base'
		&& fromCurrency === householdBaseCurrency
	) {
		return invertExchangeRate(normalizedRate);
	}

	return normalizedRate;
}

/**
 * Converts a stored canonical pair rate into the user-facing quote.
 */
export function toDisplayTransferRate(
	canonicalRate: string,
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	householdBaseCurrency: CurrencyCodeValue
): string {
	const mode = getTransferRateQuoteMode(
		fromCurrency,
		toCurrency,
		householdBaseCurrency
	);

	if (
		mode.kind === 'foreign-in-base'
		&& fromCurrency === householdBaseCurrency
	) {
		return invertExchangeRate(canonicalRate);
	}

	return canonicalRate;
}
