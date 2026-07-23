import { describe, expect, it } from 'vitest';

import type { PersistedContact } from '~/entities/contact';
import {
    filterContacts,
    getContactMonthlyExpensesById,
    getSelectableContacts
} from '~/entities/contact';
import type { Operation } from '~/entities/operation';
import { CurrencyCode } from '~/shared/lib';

const timestamp = '2026-07-01T12:00:00.000Z';

function createContact(
    id: string,
    overrides: Partial<PersistedContact> = {}
): PersistedContact {
    return {
        archivedAt: null,
        color: '#3f77a8',
        createdAt: timestamp,
        id,
        legalName: null,
        name: id,
        type: 'person',
        updatedAt: timestamp,
        version: 1,
        ...overrides
    };
}

function createOperation(
    id: string,
    overrides: Partial<Operation> = {}
): Operation {
    return {
        accountId: 'account-1',
        amountInFamilyCurrencyMinor: 1_000,
        amountMinor: 1_000,
        categoryId: null,
        categoryName: null,
        comment: '',
        contactId: 'alex',
        contactName: 'Алексей',
        createdAt: timestamp,
        currency: CurrencyCode.BYN,
        deletedAt: null,
        exchangeRate: {
            fromCurrency: CurrencyCode.BYN,
            rate: '1',
            toCurrency: CurrencyCode.BYN
        },
        happenedOn: '2026-07-10',
        id,
        sourceOrder: 0,
        title: id,
        type: 'expense',
        updatedAt: timestamp,
        ...overrides
    };
}

describe('contact selectors', () => {
    const contacts = [
        createContact('alex', { name: 'Алексей' }),
        createContact('pizza', {
            legalName: 'ООО Легкий ужин',
            name: 'Пицца Лисица',
            type: 'company'
        }),
        createContact('archive', {
            archivedAt: timestamp,
            name: 'Старый контакт'
        })
    ];

    it('filters by archive state, type and legal name', () => {
        expect(filterContacts(contacts, {
            archived: false,
            query: 'легкий ужин',
            type: 'company'
        })).toEqual([contacts[1]]);

        expect(filterContacts(contacts, {
            archived: true,
            query: '',
            type: 'all'
        })).toEqual([contacts[2]]);
    });

    it('treats е and ё as the same letter in search', () => {
        expect(filterContacts([
            createContact('dinner', { name: 'ООО Лёгкий ужин', type: 'company' })
        ], {
            archived: false,
            query: 'легкий ужин',
            type: 'all'
        })).toHaveLength(1);
    });

    it('returns only active contacts for transaction selection', () => {
        expect(getSelectableContacts(contacts).map((contact) => contact.id))
            .toEqual(['alex', 'pizza']);
    });

    it('aggregates current-month expenses by contact in family currency', () => {
        const operations = [
            createOperation('july-expense'),
            createOperation('july-income', {
                amountInFamilyCurrencyMinor: 5_000,
                type: 'income'
            }),
            createOperation('june-expense', {
                happenedOn: '2026-06-30'
            }),
            createOperation('deleted-expense', {
                deletedAt: timestamp
            })
        ];
        const julyExpenses = getContactMonthlyExpensesById(
            operations,
            new Date(2026, 6, 22, 12)
        );

        expect(julyExpenses.get('alex')).toBe(1_000);
    });
});
