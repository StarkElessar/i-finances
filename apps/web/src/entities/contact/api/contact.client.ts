import { ContactClient } from '@/features/contacts/api';

import { resolveCommandResult } from '@/shared/api';

import type {
	ChangeContactArchiveStateInput,
	ContactCommandResult,
	ContactListInput,
	CreateContactInput,
	UpdateContactInput
} from '@/entities/contact/api/contact.contract';
import type { ContactCollection } from '@/entities/contact/model/types';

import { contactCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new ContactClient();

export const getContacts = query(
	(input: ContactListInput): Promise<ContactCollection> => client.list(input.status),
	'contacts'
);

export const createContact = action(
	(input: CreateContactInput): Promise<ContactCommandResult> => resolveCommandResult(
		() => client.create(input),
		contactCommandResultSchema
	),
	'create-contact'
);

export const updateContact = action(
	(input: UpdateContactInput): Promise<ContactCommandResult> => resolveCommandResult(
		() => client.update(input),
		contactCommandResultSchema
	),
	'update-contact'
);

export const archiveContact = action(
	(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> => resolveCommandResult(
		() => client.archive(input),
		contactCommandResultSchema
	),
	'archive-contact'
);

export const restoreContact = action(
	(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> => resolveCommandResult(
		() => client.restore(input),
		contactCommandResultSchema
	),
	'restore-contact'
);
