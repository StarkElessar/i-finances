import type { PersistedContact } from '~/entities/contact/model/types';
import type { ContactRecord } from '~/server/db/schema';

/**
 * Converts a contact database row to the serializable API DTO.
 */
export function toPersistedContact(
    record: ContactRecord
): PersistedContact {
    return {
        archivedAt: record.archivedAt?.toISOString() ?? null,
        color: record.color,
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        legalName: record.legalName,
        name: record.name,
        type: record.type,
        updatedAt: record.updatedAt.toISOString(),
        version: record.version
    };
}
