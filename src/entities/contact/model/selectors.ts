import type {
    ContactType,
    PersistedContact
} from './types';

export type ContactTypeFilter = 'all' | Exclude<ContactType, 'unknown'>;

export type ContactListFilter = {
    archived: boolean;
    query: string;
    type: ContactTypeFilter;
};

const CONTACT_COLLATOR = new Intl.Collator('ru-BY', {
    numeric: true,
    sensitivity: 'base'
});

export function filterContacts(
    contacts: readonly PersistedContact[],
    filter: ContactListFilter
): PersistedContact[] {
    const normalizedQuery = normalizeSearchValue(filter.query);

    return contacts
        .filter((contact) => {
            const matchesArchive = (
                (contact.archivedAt !== null) === filter.archived
            );
            const matchesType = filter.type === 'all' || contact.type === filter.type;

            return matchesArchive
                && matchesType
                && (
                    normalizedQuery.length === 0
                    || normalizeSearchValue(contact.name).includes(normalizedQuery)
                    || (
                        contact.legalName !== null
                        && normalizeSearchValue(contact.legalName).includes(normalizedQuery)
                    )
                );
        })
        .toSorted((left, right) => CONTACT_COLLATOR.compare(left.name, right.name));
}

export function getSelectableContacts(
    contacts: readonly PersistedContact[]
): PersistedContact[] {
    return filterContacts(contacts, {
        archived: false,
        query: '',
        type: 'all'
    });
}

function normalizeSearchValue(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('ru-BY')
        .replace(/ё/g, 'е');
}
