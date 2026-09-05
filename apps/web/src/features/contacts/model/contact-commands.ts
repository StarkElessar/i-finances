import type { ContactClient } from '@/features/contacts/api';

import type { PersistedContact } from '@i-finances/contracts';
import { updateContactInputSchema } from '@i-finances/contracts';

import type { ContactFormFields } from './contact-form';

export function updateContact(
	client: ContactClient,
	contact: PersistedContact,
	fields: ContactFormFields
) {
	return client.update(updateContactInputSchema.parse({
		...fields,
		id: contact.id,
		version: contact.version
	}));
}
