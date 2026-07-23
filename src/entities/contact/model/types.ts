import type { CurrencyCodeValue } from '~/shared/lib';

export type ContactType = 'company' | 'person' | 'unknown';

export type Contact = {
    color: string;
    createdAt: string;
    id: string;
    legalName: string | null;
    name: string;
    type: ContactType;
    updatedAt: string;
};

/**
 * Canonical contact DTO returned by the server persistence layer.
 */
export type PersistedContact = Contact & {
    archivedAt: string | null;
    version: number;
};

export type ContactCollection = {
    baseCurrency: CurrencyCodeValue;
    items: PersistedContact[];
};
