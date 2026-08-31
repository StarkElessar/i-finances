import { CurrencyCode } from '~/shared/lib';

import {
	formatTransferRateQuoteLabel,
	getTransferRateQuoteMode,
	toCanonicalTransferRate,
	toDisplayTransferRate
} from '~/entities/transfer/model/rate-quote';

import { describe, expect, it } from 'vitest';

describe('transfer rate quote', () => {
	it('keeps foreign→base quotes as multiply rates', () => {
		expect(toCanonicalTransferRate(
			'2.4',
			CurrencyCode.USD,
			CurrencyCode.BYN,
			CurrencyCode.BYN
		)).toBe('2.4');

		expect(toDisplayTransferRate(
			'2.4',
			CurrencyCode.USD,
			CurrencyCode.BYN,
			CurrencyCode.BYN
		)).toBe('2.4');

		expect(formatTransferRateQuoteLabel(getTransferRateQuoteMode(
			CurrencyCode.USD,
			CurrencyCode.BYN,
			CurrencyCode.BYN
		))).toBe('Курс (1 USD = … BYN)');
	});

	it('inverts base→foreign bank-style quotes for the canonical pair rate', () => {
		expect(toCanonicalTransferRate(
			'3.2',
			CurrencyCode.BYN,
			CurrencyCode.EUR,
			CurrencyCode.BYN
		)).toBe('0.3125');

		expect(toDisplayTransferRate(
			'0.3125',
			CurrencyCode.BYN,
			CurrencyCode.EUR,
			CurrencyCode.BYN
		)).toBe('3.2');

		expect(formatTransferRateQuoteLabel(getTransferRateQuoteMode(
			CurrencyCode.BYN,
			CurrencyCode.EUR,
			CurrencyCode.BYN
		))).toBe('Курс (1 EUR = … BYN)');
	});

	it('uses from→to quotes when neither currency is the household base', () => {
		expect(toCanonicalTransferRate(
			'0.9',
			CurrencyCode.USD,
			CurrencyCode.EUR,
			CurrencyCode.BYN
		)).toBe('0.9');

		expect(formatTransferRateQuoteLabel(getTransferRateQuoteMode(
			CurrencyCode.USD,
			CurrencyCode.EUR,
			CurrencyCode.BYN
		))).toBe('Курс (1 USD = … EUR)');
	});
});
