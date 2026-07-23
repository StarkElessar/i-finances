import { describe, expect, it } from 'vitest';

import type { Account } from '~/entities/account';
import {
    canMoveToNextOperationPeriod,
    createOperationGroups,
    filterOperationRows,
    getAccountBalanceMinor,
    getAccountOperationsWithBalances,
    getOperationPeriodRange,
    INITIAL_OPERATIONS
} from '~/entities/operation';
import { AccountColor, AccountType, CurrencyCode } from '~/shared/lib';

const cashAccount: Account = {
    color: AccountColor.GREEN,
    currency: CurrencyCode.BYN,
    description: 'Test fixture',
    id: INITIAL_OPERATIONS[0].accountId,
    initialBalanceMinor: -773,
    isColorAccentEnabled: true,
    isIncludedInFamilyTotal: true,
    name: 'Наличные',
    type: AccountType.CASH
};
const cashRows = getAccountOperationsWithBalances(cashAccount, INITIAL_OPERATIONS);
const julyRange = getOperationPeriodRange(new Date(2026, 6, 22, 12), 'month');

describe('operation balances', () => {
    it('reconciles the imported closing account balance', () => {
        expect(getAccountBalanceMinor(cashAccount, INITIAL_OPERATIONS)).toBe(613_155);
        expect(cashRows.at(-1)?.balanceAfterMinor).toBe(613_155);
    });

    it('calculates the true date-group balance independently of filtering', () => {
        const julyRows = filterOperationRows(cashRows, julyRange, '');
        const filteredRows = filterOperationRows(cashRows, julyRange, 'Детские');
        const groups = createOperationGroups(filteredRows, cashRows, {
            direction: 'desc',
            field: 'date'
        });
        const july17 = groups.find((group) => group.label === '2026-07-17');

        expect(julyRows.length).toBeGreaterThan(filteredRows.length);
        expect(july17).toMatchObject({
            closingBalanceMinor: 613_155,
            differenceMinor: 113_230,
            openingBalanceMinor: 499_925
        });
    });
});

describe('operation periods and search', () => {
    it('uses the current calendar month and blocks future periods', () => {
        expect(julyRange).toEqual({ end: '2026-07-31', start: '2026-07-01' });
        expect(canMoveToNextOperationPeriod(
            new Date(2026, 6, 22, 12),
            'month',
            new Date(2026, 6, 22, 12)
        )).toBe(false);
        expect(canMoveToNextOperationPeriod(
            new Date(2026, 5, 15, 12),
            'month',
            new Date(2026, 6, 22, 12)
        )).toBe(true);
    });

    it('searches exact numeric amounts only for numeric queries', () => {
        const matches = filterOperationRows(cashRows, julyRange, '47,94');

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.every((operation) => operation.amountMinor === 4_794)).toBe(true);
    });

    it('searches title, comment, category and contact for text queries', () => {
        const matches = filterOperationRows(cashRows, julyRange, 'чистые родники');

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.every((operation) => (
            operation.contactName?.toLocaleLowerCase('ru-BY').includes('чистые родники')
        ))).toBe(true);
    });
});

describe('operation groups', () => {
    it('keeps newest category operations first', () => {
        const groups = createOperationGroups(
            filterOperationRows(cashRows, julyRange, ''),
            cashRows,
            { direction: 'asc', field: 'category' }
        );

        groups.forEach((group) => {
            for (let index = 1; index < group.operations.length; index += 1) {
                expect(group.operations[index - 1].happenedOn >= group.operations[index].happenedOn).toBe(true);
            }
        });
    });

    it('creates one numeric group for amount sorting', () => {
        const groups = createOperationGroups(
            filterOperationRows(cashRows, julyRange, ''),
            cashRows,
            { direction: 'desc', field: 'amount' }
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Сумма');
        expect(groups[0].operations[0].signedAmountMinor)
            .toBeGreaterThanOrEqual(groups[0].operations[1].signedAmountMinor);
    });
});
