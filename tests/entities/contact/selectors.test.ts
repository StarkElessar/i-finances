import { describe, expect, it } from 'vitest';

import type { PersistedContact } from '~/entities/contact';
import {
    filterContacts,
    getSelectableContacts
} from '~/entities/contact';

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
});
