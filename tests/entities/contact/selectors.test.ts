import { describe, expect, it } from 'vitest';

import type { Contact } from '~/entities/contact';
import {
    filterContacts,
    getContactMonthlyExpensesById,
    getSelectableContacts
} from '~/entities/contact';
import { INITIAL_OPERATIONS } from '~/entities/operation';

const timestamp = '2026-07-01T12:00:00.000Z';

function createContact(id: string, overrides: Partial<Contact> = {}): Contact {
    return {
        color: '#3f77a8',
        createdAt: timestamp,
        id,
        isArchived: false,
        legalName: null,
        name: id,
        type: 'person',
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
        createContact('archive', { isArchived: true, name: 'Старый контакт' })
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
        const julyExpenses = getContactMonthlyExpensesById(
            INITIAL_OPERATIONS,
            new Date(2026, 6, 22, 12)
        );
        const operation = INITIAL_OPERATIONS.find((item) => (
            item.type === 'expense'
            && item.contactId !== null
            && item.happenedOn.startsWith('2026-07')
        ));

        expect(operation).toBeDefined();

        const expectedAmount = INITIAL_OPERATIONS.reduce((total, item) => (
            item.type === 'expense'
            && item.contactId === operation?.contactId
            && item.happenedOn.startsWith('2026-07')
                ? total + item.amountInFamilyCurrencyMinor
                : total
        ), 0);

        expect(julyExpenses.get(operation?.contactId ?? '')).toBe(expectedAmount);
    });
});
