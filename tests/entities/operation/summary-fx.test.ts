import { describe, expect, it } from 'vitest';

import {
	getOperationBaseEquivalentMinor,
	getSignedAccountAmountMinor,
	getSummaryPeriodFxTotals
} from '../../../src/entities/operation';
import { CurrencyCode, type CurrencyExchangeRates } from '../../../src/shared/lib';

const bynRates = {
	baseCurrency: CurrencyCode.BYN,
	ratesToBaseCurrency: {
		[CurrencyCode.USD]: 3.25,
		[CurrencyCode.EUR]: 3.75
	}
} satisfies CurrencyExchangeRates;

const usdRates = {
	baseCurrency: CurrencyCode.USD,
	ratesToBaseCurrency: {
		[CurrencyCode.BYN]: 1 / 3.25,
		[CurrencyCode.EUR]: 3.75 / 3.25
	}
} satisfies CurrencyExchangeRates;

describe('getSignedAccountAmountMinor', () => {
	it('negates expenses and keeps income positive', () => {
		expect(getSignedAccountAmountMinor({
			amountMinor: 15_000,
			currency: CurrencyCode.USD,
			type: 'expense'
		})).toBe(-15_000);

		expect(getSignedAccountAmountMinor({
			amountMinor: 2_000,
			currency: CurrencyCode.BYN,
			type: 'income'
		})).toBe(2_000);
	});
});

describe('getOperationBaseEquivalentMinor', () => {
	it('converts foreign currency amounts into household base', () => {
		expect(getOperationBaseEquivalentMinor(
			{
				amountMinor: 15_000,
				currency: CurrencyCode.USD,
				type: 'expense'
			},
			CurrencyCode.BYN,
			bynRates
		)).toBe(-48_750);
	});

	it('returns undefined when operation currency matches household base', () => {
		expect(getOperationBaseEquivalentMinor(
			{
				amountMinor: 94_400,
				currency: CurrencyCode.BYN,
				type: 'expense'
			},
			CurrencyCode.BYN,
			bynRates
		)).toBeUndefined();
	});

	it('returns undefined when rates are missing for a foreign amount', () => {
		expect(getOperationBaseEquivalentMinor(
			{
				amountMinor: 15_000,
				currency: CurrencyCode.USD,
				type: 'expense'
			},
			CurrencyCode.BYN,
			undefined
		)).toBeUndefined();
	});
});

describe('getSummaryPeriodFxTotals', () => {
	it('sums mixed currencies into household base and adds a USD secondary total', () => {
		const totals = getSummaryPeriodFxTotals(
			[
				{
					amountMinor: 94_400,
					currency: CurrencyCode.BYN,
					type: 'expense'
				},
				{
					amountMinor: 15_000,
					currency: CurrencyCode.USD,
					type: 'expense'
				}
			],
			CurrencyCode.BYN,
			bynRates
		);

		expect(totals).toEqual({
			baseCurrency: CurrencyCode.BYN,
			baseTotalMinor: -143_150,
			usdTotalMinor: -44_046
		});
	});

	it('omits USD secondary when household base is already USD', () => {
		const totals = getSummaryPeriodFxTotals(
			[
				{
					amountMinor: 15_000,
					currency: CurrencyCode.USD,
					type: 'expense'
				}
			],
			CurrencyCode.USD,
			usdRates
		);

		expect(totals).toEqual({
			baseCurrency: CurrencyCode.USD,
			baseTotalMinor: -15_000,
			usdTotalMinor: undefined
		});
	});

	it('returns undefined when a foreign amount cannot be converted', () => {
		expect(getSummaryPeriodFxTotals(
			[
				{
					amountMinor: 15_000,
					currency: CurrencyCode.USD,
					type: 'expense'
				}
			],
			CurrencyCode.BYN,
			undefined
		)).toBeUndefined();
	});

	it('sums base-only operations without rates and skips USD secondary', () => {
		expect(getSummaryPeriodFxTotals(
			[
				{
					amountMinor: 10_000,
					currency: CurrencyCode.BYN,
					type: 'expense'
				},
				{
					amountMinor: 2_000,
					currency: CurrencyCode.BYN,
					type: 'income'
				}
			],
			CurrencyCode.BYN,
			undefined
		)).toEqual({
			baseCurrency: CurrencyCode.BYN,
			baseTotalMinor: -8_000,
			usdTotalMinor: undefined
		});
	});
});
