import { describe, expect, it } from 'vitest';

import {
    createOperation,
    getAccountBalanceMinor,
    softDeleteOperation,
    updateOperation
} from '~/entities/operation';
import { CurrencyCode } from '~/shared/lib';

const timestamp = '2026-07-23T12:00:00.000Z';
const baseValue = {
    amountMinor: 12_000,
    categoryId: 'gifts',
    comment: '',
    contactId: null,
    exchangeRate: '3.25',
    happenedOn: '2026-07-23',
    title: 'Подарки',
    type: 'expense' as const
};

describe('operation mutations', () => {
    it('snapshots the transaction exchange rate and family amount', () => {
        const operation = createOperation({
            accountId: 'usd-account',
            allOperations: [],
            categoryName: 'Подарки',
            contactName: null,
            currency: CurrencyCode.USD,
            familyCurrency: CurrencyCode.BYN,
            id: 'operation-1',
            timestamp,
            value: baseValue
        });

        expect(operation).toMatchObject({
            amountInFamilyCurrencyMinor: 39_000,
            deletedAt: null,
            exchangeRate: {
                fromCurrency: CurrencyCode.USD,
                rate: '3.25',
                toCurrency: CurrencyCode.BYN
            }
        });
    });

    it('moves a date-changed operation to the beginning of its destination day', () => {
        const firstOperation = createOperation({
            accountId: 'usd-account',
            allOperations: [],
            categoryName: null,
            contactName: null,
            currency: CurrencyCode.USD,
            familyCurrency: CurrencyCode.BYN,
            id: 'operation-1',
            timestamp,
            value: baseValue
        });
        const destinationOperation = {
            ...firstOperation,
            happenedOn: '2026-07-24',
            id: 'operation-2',
            sourceOrder: -4
        };
        const updatedOperation = updateOperation(firstOperation, {
            allOperations: [firstOperation, destinationOperation],
            categoryName: 'Подарки',
            contactName: null,
            familyCurrency: CurrencyCode.BYN,
            timestamp: '2026-07-23T13:00:00.000Z',
            value: {
                ...baseValue,
                happenedOn: '2026-07-24'
            }
        });

        expect(updatedOperation.sourceOrder).toBe(-5);
        expect(updatedOperation.createdAt).toBe(timestamp);
    });

    it('soft-deleted operations no longer affect account balance', () => {
        const operation = createOperation({
            accountId: 'usd-account',
            allOperations: [],
            categoryName: null,
            contactName: null,
            currency: CurrencyCode.USD,
            familyCurrency: CurrencyCode.BYN,
            id: 'operation-1',
            timestamp,
            value: baseValue
        });
        const deletedOperation = softDeleteOperation(
            operation,
            '2026-07-23T14:00:00.000Z'
        );
        const account = {
            color: '#000000',
            currency: CurrencyCode.USD,
            description: '',
            id: 'usd-account',
            initialBalanceMinor: 50_000,
            isColorAccentEnabled: false,
            isIncludedInFamilyTotal: true,
            name: 'USD',
            type: 'cash' as const
        };

        expect(getAccountBalanceMinor(account, [operation])).toBe(38_000);
        expect(getAccountBalanceMinor(account, [deletedOperation])).toBe(50_000);
    });
});
