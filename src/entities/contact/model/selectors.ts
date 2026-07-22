import type { Contact, ContactType } from './types';

import type { Operation } from '~/entities/operation';

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
    contacts: readonly Contact[],
    filter: ContactListFilter
): Contact[] {
    const normalizedQuery = normalizeSearchValue(filter.query);

    return contacts
        .filter((contact) => contact.isArchived === filter.archived)
        .filter((contact) => filter.type === 'all' || contact.type === filter.type)
        .filter((contact) => {
            if (!normalizedQuery) {
                return true;
            }

            return [contact.name, contact.legalName ?? '']
                .some((value) => normalizeSearchValue(value).includes(normalizedQuery));
        })
        .toSorted((left, right) => CONTACT_COLLATOR.compare(left.name, right.name));
}

export function getSelectableContacts(contacts: readonly Contact[]): Contact[] {
    return contacts
        .filter((contact) => !contact.isArchived)
        .toSorted((left, right) => CONTACT_COLLATOR.compare(left.name, right.name));
}

export function getContactMonthlyExpensesById(
    operations: readonly Operation[],
    monthDate: Date
): ReadonlyMap<string, number> {
    const expensesByContactId = new Map<string, number>();

    operations.forEach((operation) => {
        if (
            operation.type !== 'expense'
            || operation.contactId === null
            || !isSameMonth(operation.happenedOn, monthDate)
        ) {
            return;
        }

        const currentAmount = expensesByContactId.get(operation.contactId) ?? 0;

        expensesByContactId.set(
            operation.contactId,
            currentAmount + operation.amountInFamilyCurrencyMinor
        );
    });

    return expensesByContactId;
}

function normalizeSearchValue(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('ru-BY')
        .replace(/ё/g, 'е');
}

function isSameMonth(dateKey: string, monthDate: Date): boolean {
    const [year, month] = dateKey.split('-').map(Number);

    return year === monthDate.getFullYear() && month - 1 === monthDate.getMonth();
}
