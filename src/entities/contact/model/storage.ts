import type { Contact, ContactType } from './types';

export const CONTACT_STORAGE_KEY = 'i-finances.contacts.v1';

export function readContactsFromStorage(storage: Storage): Contact[] | undefined {
    const rawValue = storage.getItem(CONTACT_STORAGE_KEY);

    if (!rawValue) {
        return undefined;
    }

    try {
        const parsedValue: unknown = JSON.parse(rawValue);

        if (!Array.isArray(parsedValue)) {
            return undefined;
        }

        return parsedValue
            .map(normalizeStoredContact)
            .filter((contact): contact is Contact => contact !== undefined);
    }
    catch {
        return undefined;
    }
}

export function writeContactsToStorage(storage: Storage, contacts: readonly Contact[]): void {
    storage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contacts));
}

export function mergeContactsWithImported(
    storedContacts: readonly Contact[],
    importedContacts: readonly Contact[]
): Contact[] {
    const storedIds = new Set(storedContacts.map((contact) => contact.id));

    return [
        ...storedContacts,
        ...importedContacts.filter((contact) => !storedIds.has(contact.id))
    ];
}

function normalizeStoredContact(value: unknown): Contact | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const color = normalizeColor(value.color);
    const createdAt = normalizeDate(value.createdAt);
    const id = normalizeRequiredString(value.id);
    const name = normalizeRequiredString(value.name);
    const type = normalizeContactType(value.type);
    const updatedAt = normalizeDate(value.updatedAt);

    if (
        color === undefined
        || createdAt === undefined
        || id === undefined
        || name === undefined
        || type === undefined
        || updatedAt === undefined
        || typeof value.isArchived !== 'boolean'
    ) {
        return undefined;
    }

    return {
        color,
        createdAt,
        id,
        isArchived: value.isArchived,
        legalName: type === 'company' ? normalizeOptionalString(value.legalName) : null,
        name,
        type,
        updatedAt
    };
}

function normalizeContactType(value: unknown): ContactType | undefined {
    return value === 'company' || value === 'person' || value === 'unknown'
        ? value
        : undefined;
}

function normalizeRequiredString(value: unknown): string | undefined {
    const normalizedValue = normalizeOptionalString(value);

    return normalizedValue ?? undefined;
}

function normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    return value.trim().replace(/\s+/g, ' ') || null;
}

function normalizeColor(value: unknown): string | undefined {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
        ? value
        : undefined;
}

function normalizeDate(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
