import type { ExchangeRateQuote } from '@/modules/exchange-rate';
import { TransferConversionAmountError } from '@/modules/transfer';
import { createTransferAmountPlan } from '@/modules/transfer/transfer-rate';

import { describe, expect, it } from 'vitest';

const HAPPENED_ON = '2026-09-06';

function unusedResolver(): Promise<ExchangeRateQuote> {
	throw new Error('Foreign base quote must not be resolved for this case.');
}

describe('createTransferAmountPlan', () => {
	it('uses the entered rate on the debit leg when the credit side is the base currency', async () => {
		const plan = await createTransferAmountPlan({
			fromAmountMinor: 10_000,
			fromCurrency: 'USD',
			happenedOn: HAPPENED_ON,
			householdBaseCurrency: 'BYN',
			resolveForeignBaseQuote: unusedResolver,
			toCurrency: 'BYN',
			transferRate: '3'
		});

		expect(plan.toAmountMinor).toBe(30_000);
		expect(plan.baseAmountMinor).toBe(30_000);
		expect(plan.fromLeg).toMatchObject({
			amountInHouseholdBaseCurrencyMinor: 30_000,
			rate: '3'
		});
		expect(plan.toLeg).toMatchObject({
			amountInHouseholdBaseCurrencyMinor: 30_000,
			rate: '1',
			source: 'identity'
		});
	});

	it('inverts the entered rate when the debit side is the base currency', async () => {
		const plan = await createTransferAmountPlan({
			fromAmountMinor: 30_000,
			fromCurrency: 'BYN',
			happenedOn: HAPPENED_ON,
			householdBaseCurrency: 'BYN',
			resolveForeignBaseQuote: unusedResolver,
			toCurrency: 'USD',
			transferRate: '0.5'
		});

		expect(plan.toAmountMinor).toBe(15_000);
		expect(plan.baseAmountMinor).toBe(30_000);
		expect(plan.fromLeg).toMatchObject({ rate: '1', source: 'identity' });
		expect(plan.toLeg.amountInHouseholdBaseCurrencyMinor).toBe(30_000);
	});

	/**
	 * Both legs must report the same base-currency amount, otherwise balances
	 * and the monthly summary drift apart for a single transfer.
	 */
	it('synthesises the credit rate so both legs agree on the base amount', async () => {
		const plan = await createTransferAmountPlan({
			fromAmountMinor: 10_000,
			fromCurrency: 'USD',
			happenedOn: HAPPENED_ON,
			householdBaseCurrency: 'BYN',
			resolveForeignBaseQuote: () => Promise.resolve({
				effectiveOn: HAPPENED_ON,
				fromCurrency: 'USD',
				rate: '3',
				source: 'nbrb',
				toCurrency: 'BYN'
			}),
			toCurrency: 'EUR',
			transferRate: '0.9'
		});

		expect(plan.toAmountMinor).toBe(9_000);
		expect(plan.fromLeg.amountInHouseholdBaseCurrencyMinor)
			.toBe(plan.toLeg.amountInHouseholdBaseCurrencyMinor);
		expect(plan.fromLeg.amountInHouseholdBaseCurrencyMinor).toBe(30_000);
	});

	// The amount check runs before the function returns its promise, so this
	// rejection surfaces synchronously to callers.
	it('rejects a rate that rounds the credit amount down to zero', () => {
		expect(() => createTransferAmountPlan({
			fromAmountMinor: 1,
			fromCurrency: 'USD',
			happenedOn: HAPPENED_ON,
			householdBaseCurrency: 'BYN',
			resolveForeignBaseQuote: unusedResolver,
			toCurrency: 'BYN',
			transferRate: '0.000000000001'
		})).toThrow(TransferConversionAmountError);
	});
});
