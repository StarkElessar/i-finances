import { type CurrencyCodeValue } from './currency-code';

export type CurrencyExchangeRates = Readonly<{
	baseCurrency: CurrencyCodeValue;
	ratesToBaseCurrency: Partial<Record<CurrencyCodeValue, number>>;
}>;

export type MoneyAmount = Readonly<{
	amount: number;
	currency: CurrencyCodeValue;
}>;

export function convertCurrency(
	amount: number,
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	exchangeRates: CurrencyExchangeRates
): number {
	const fromRate = getRateToBaseCurrency(fromCurrency, exchangeRates);
	const toRate = getRateToBaseCurrency(toCurrency, exchangeRates);

	return (amount * fromRate) / toRate;
}

export function sumMoney(
	amounts: readonly MoneyAmount[],
	targetCurrency: CurrencyCodeValue,
	exchangeRates: CurrencyExchangeRates
): number {
	return amounts.reduce((total, item) => {
		return total + convertCurrency(item.amount, item.currency, targetCurrency, exchangeRates);
	}, 0);
}

function getRateToBaseCurrency(currency: CurrencyCodeValue, exchangeRates: CurrencyExchangeRates): number {
	if (currency === exchangeRates.baseCurrency) {
		return 1;
	}

	const rate = exchangeRates.ratesToBaseCurrency[currency];

	if (!rate || !Number.isFinite(rate) || rate <= 0) {
		throw new Error(`Missing positive exchange rate for ${currency}`);
	}

	return rate;
}
