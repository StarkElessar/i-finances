import { describe, expect, it } from 'vitest';

import {
    createOperation,
    OPERATION_STORAGE_KEY,
    readOperationsFromStorage,
    writeOperationsToStorage
} from '~/entities/operation';
import { CurrencyCode } from '~/shared/lib';

function createMemoryStorage(): Storage {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => values.delete(key),
        setItem: (key, value) => values.set(key, value)
    };
}

function createStoredOperation() {
    return createOperation({
        accountId: 'cash-byn',
        allOperations: [],
        categoryName: null,
        contactName: null,
        currency: CurrencyCode.BYN,
        familyCurrency: CurrencyCode.BYN,
        id: 'operation-1',
        timestamp: '2026-07-23T12:00:00.000Z',
        value: {
            amountMinor: 1_250,
            categoryId: null,
            comment: '',
            contactId: null,
            exchangeRate: '1',
            happenedOn: '2026-07-23',
            title: 'Кофе',
            type: 'expense'
        }
    });
}

describe('operation storage', () => {
    it('round-trips the complete ledger', () => {
        const storage = createMemoryStorage();
        const operations = [createStoredOperation()];

        writeOperationsToStorage(storage, operations);

        expect(readOperationsFromStorage(storage)).toEqual(operations);
    });

    it('skips malformed operations without dropping valid records', () => {
        const storage = createMemoryStorage();
        const validOperation = createStoredOperation();

        storage.setItem(OPERATION_STORAGE_KEY, JSON.stringify([
            validOperation,
            { id: 'invalid' }
        ]));

        expect(readOperationsFromStorage(storage)).toEqual([validOperation]);
    });
});
