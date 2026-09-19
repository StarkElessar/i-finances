import { insertOperationIntoLedger } from '@/entities/operation/model/selectors';
import type { AccountLedger, Operation, OperationWithBalance } from '@/entities/operation/model/types';

import { describe, expect, it } from 'vitest';

function makeOperation(overrides: Partial<Operation> = {}): Operation {
	return {
		accountId: 'account/main',
		amountInHouseholdBaseCurrencyMinor: 1_000,
		amountMinor: 1_000,
		categoryId: null,
		categoryName: null,
		comment: '',
		contactId: null,
		contactName: null,
		createdAt: '2026-08-05T10:00:00.000Z',
		currency: 'BYN',
		deletedAt: null,
		deletedByUserId: null,
		exchangeRate: {
			effectiveOn: '2026-08-05',
			fromCurrency: 'BYN',
			rate: '1',
			source: 'fixed',
			toCurrency: 'BYN'
		},
		happenedOn: '2026-08-05',
		householdBaseCurrency: 'BYN',
		id: 'operation/new',
		sourceOrder: 100,
		title: 'New operation',
		transferId: null,
		type: 'expense',
		updatedAt: '2026-08-05T10:00:00.000Z',
		version: 1,
		...overrides
	};
}

function makeLedgerItem(overrides: Partial<OperationWithBalance> = {}): OperationWithBalance {
	const base = makeOperation(overrides);

	return {
		...base,
		balanceAfterMinor: overrides.balanceAfterMinor ?? 0,
		signedAmountMinor: overrides.signedAmountMinor
			?? (base.type === 'expense' ? -base.amountMinor : base.amountMinor)
	};
}

function makeLedger(overrides: Partial<AccountLedger> = {}): AccountLedger {
	return {
		accountCurrency: 'BYN',
		accountId: 'account/main',
		closingBalanceMinor: 10_000,
		householdBaseCurrency: 'BYN',
		items: [],
		openingBalanceMinor: 10_000,
		range: { end: '2026-08-31', start: '2026-08-01' },
		...overrides
	};
}

describe('insertOperationIntoLedger', () => {
	it('inserts the only row into an empty ledger', () => {
		const ledger = makeLedger({ closingBalanceMinor: 10_000, items: [], openingBalanceMinor: 10_000 });
		const operation = makeOperation({ amountMinor: 1_500, happenedOn: '2026-08-10', type: 'expense' });

		const result = insertOperationIntoLedger(ledger, operation);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			balanceAfterMinor: 8_500,
			id: 'operation/new',
			signedAmountMinor: -1_500
		});
		expect(result.closingBalanceMinor).toBe(8_500);
	});

	it('inserts an income row at the end and keeps earlier rows untouched by reference', () => {
		const firstRow = makeLedgerItem({
			amountMinor: 2_000,
			balanceAfterMinor: 8_000,
			happenedOn: '2026-08-05',
			id: 'operation/first',
			signedAmountMinor: -2_000,
			sourceOrder: 1,
			type: 'expense'
		});
		const ledger = makeLedger({
			closingBalanceMinor: 8_000,
			items: [firstRow],
			openingBalanceMinor: 10_000
		});
		const operation = makeOperation({
			amountMinor: 3_000,
			happenedOn: '2026-08-20',
			id: 'operation/second',
			sourceOrder: 2,
			type: 'income'
		});

		const result = insertOperationIntoLedger(ledger, operation);

		expect(result.items).toHaveLength(2);
		expect(result.items[0]).toBe(firstRow);
		expect(result.items[1]).toMatchObject({
			balanceAfterMinor: 11_000,
			id: 'operation/second',
			signedAmountMinor: 3_000
		});
		expect(result.closingBalanceMinor).toBe(11_000);
	});

	it('inserts a row in the middle, shifting only the balances that follow it', () => {
		const earlyRow = makeLedgerItem({
			amountMinor: 1_000,
			balanceAfterMinor: 9_000,
			happenedOn: '2026-08-02',
			id: 'operation/early',
			signedAmountMinor: -1_000,
			sourceOrder: 1,
			type: 'expense'
		});
		const lateRow = makeLedgerItem({
			amountMinor: 500,
			balanceAfterMinor: 9_500,
			happenedOn: '2026-08-25',
			id: 'operation/late',
			signedAmountMinor: 500,
			sourceOrder: 2,
			type: 'income'
		});
		const ledger = makeLedger({
			closingBalanceMinor: 9_500,
			items: [earlyRow, lateRow],
			openingBalanceMinor: 10_000
		});
		const operation = makeOperation({
			amountMinor: 2_000,
			happenedOn: '2026-08-15',
			id: 'operation/middle',
			sourceOrder: 3,
			type: 'expense'
		});

		const result = insertOperationIntoLedger(ledger, operation);

		expect(result.items.map((item) => item.id)).toEqual([
			'operation/early',
			'operation/middle',
			'operation/late'
		]);
		expect(result.items[0]).toBe(earlyRow);
		expect(result.items[1]).toMatchObject({ balanceAfterMinor: 7_000 });
		expect(result.items[2]).toMatchObject({ balanceAfterMinor: 7_500 });
		expect(result.items[2]).not.toBe(lateRow);
		expect(result.closingBalanceMinor).toBe(7_500);
	});

	it('breaks a same-day tie by sourceOrder', () => {
		const morningRow = makeLedgerItem({
			amountMinor: 1_000,
			balanceAfterMinor: 9_000,
			happenedOn: '2026-08-10',
			id: 'operation/morning',
			signedAmountMinor: -1_000,
			sourceOrder: 5,
			type: 'expense'
		});
		const ledger = makeLedger({
			closingBalanceMinor: 9_000,
			items: [morningRow],
			openingBalanceMinor: 10_000
		});
		const earlierSameDay = makeOperation({
			amountMinor: 400,
			happenedOn: '2026-08-10',
			id: 'operation/earlier-same-day',
			sourceOrder: 3,
			type: 'expense'
		});

		const result = insertOperationIntoLedger(ledger, earlierSameDay);

		expect(result.items.map((item) => item.id)).toEqual([
			'operation/earlier-same-day',
			'operation/morning'
		]);
		expect(result.items[0]).toMatchObject({ balanceAfterMinor: 9_600 });
		expect(result.items[1]).toMatchObject({ balanceAfterMinor: 8_600 });
	});

	it('shifts opening and running balances without adding a row for a date before the period', () => {
		const existingRow = makeLedgerItem({
			amountMinor: 500,
			balanceAfterMinor: 10_500,
			happenedOn: '2026-08-05',
			id: 'operation/existing',
			signedAmountMinor: 500,
			sourceOrder: 1,
			type: 'income'
		});
		const ledger = makeLedger({
			closingBalanceMinor: 10_500,
			items: [existingRow],
			openingBalanceMinor: 10_000
		});
		const backdated = makeOperation({
			amountMinor: 1_000,
			happenedOn: '2026-07-20',
			id: 'operation/backdated',
			type: 'expense'
		});

		const result = insertOperationIntoLedger(ledger, backdated);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			balanceAfterMinor: 9_500,
			id: 'operation/existing'
		});
		expect(result.openingBalanceMinor).toBe(9_000);
		expect(result.closingBalanceMinor).toBe(9_500);
	});

	it('leaves the ledger untouched for a date after the period', () => {
		const ledger = makeLedger();
		const futureDated = makeOperation({ happenedOn: '2026-09-01', id: 'operation/future' });

		const result = insertOperationIntoLedger(ledger, futureDated);

		expect(result).toBe(ledger);
	});
});
