import type { PersistedContact } from '@i-finances/contracts';

import type { ContactRecord } from './contact-repository';

export function toPersistedContact(record: ContactRecord): PersistedContact {
	return {
		archivedAt: record.archivedAt?.toISOString() ?? null,
		color: record.color,
		createdAt: record.createdAt.toISOString(),
		id: record.id,
		legalName: record.legalName,
		name: record.name,
		phone: record.phone,
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}
