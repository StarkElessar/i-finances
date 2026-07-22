import { describe, expect, it } from 'vitest';

import type { Contact } from '~/entities/contact';
import {
    CONTACT_STORAGE_KEY,
    mergeContactsWithImported,
    readContactsFromStorage,
    writeContactsToStorage
} from '~/entities/contact';

const timestamp = '2026-07-01T12:00:00.000Z';

function createContact(id: string, overrides: Partial<Contact> = {}): Contact {
    return {
        color: '#3f77a8',
        createdAt: timestamp,
        id,
        isArchived: false,
        legalName: null,
        name: `Контакт ${id}`,
        type: 'person',
        updatedAt: timestamp,
        ...overrides
    };
}

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

describe('contact storage', () => {
    it('round-trips normalized contact data', () => {
        const storage = createMemoryStorage();
        const contacts = [createContact('company', {
            legalName: 'ООО Легкий ужин',
            name: 'Пицца Лисица',
            type: 'company'
        })];

        writeContactsToStorage(storage, contacts);

        expect(readContactsFromStorage(storage)).toEqual(contacts);
    });

    it('ignores malformed records without losing valid contacts', () => {
        const storage = createMemoryStorage();

        storage.setItem(CONTACT_STORAGE_KEY, JSON.stringify([
            createContact('valid'),
            { id: 'invalid', name: '' }
        ]));

        expect(readContactsFromStorage(storage)).toEqual([createContact('valid')]);
    });

    it('preserves local changes and appends newly imported contacts', () => {
        const storedContact = createContact('stored', { isArchived: true });
        const importedContacts = [
            createContact('stored'),
            createContact('new-import')
        ];

        expect(mergeContactsWithImported([storedContact], importedContacts)).toEqual([
            storedContact,
            importedContacts[1]
        ]);
    });
});
