import { ContactClient } from '@/features/contacts/api';

import type {
	ChangeContactArchiveStateInput,
	ContactCommandResult,
	ContactListInput,
	CreateContactInput,
	UpdateContactInput
} from '@/entities/contact/api/contact.contract';
import type { ContactCollection } from '@/entities/contact/model/types';

import { action, query } from '@solidjs/router';

const client = new ContactClient();

export const getContacts = query(
	(input: ContactListInput): Promise<ContactCollection> => client.list(input.status),
	'contacts'
);

export const createContact = action(
	(input: CreateContactInput): Promise<ContactCommandResult> => client.create(input),
	'create-contact'
);

export const updateContact = action(
	(input: UpdateContactInput): Promise<ContactCommandResult> => client.update(input),
	'update-contact'
);

export const archiveContact = action(
	(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> => client.archive(input),
	'archive-contact'
);

export const restoreContact = action(
	(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> => client.restore(input),
	'restore-contact'
);
