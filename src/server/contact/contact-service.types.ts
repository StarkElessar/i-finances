import type { ContactRepository } from './contact-repository';

import type {
	ChangeContactArchiveStateInput,
	ContactListStatus,
	CreateContactInput,
	UpdateContactInput
} from '~/entities/contact/api/contact.contract';
import type {
	ContactCollection,
	PersistedContact
} from '~/entities/contact/model/types';
import type { HouseholdResolver } from '~/server/household/household-service';

export type ContactServiceDependencies = {
	contactRepository: ContactRepository;
	householdResolver: HouseholdResolver;
	createId?: () => string;
	now?: () => Date;
};

export type ContactService = {
	archive: (
		userId: string,
		input: ChangeContactArchiveStateInput
	) => Promise<PersistedContact>;
	create: (
		userId: string,
		input: CreateContactInput
	) => Promise<PersistedContact>;
	list: (
		userId: string,
		status: ContactListStatus
	) => Promise<ContactCollection>;
	restore: (
		userId: string,
		input: ChangeContactArchiveStateInput
	) => Promise<PersistedContact>;
	update: (
		userId: string,
		input: UpdateContactInput
	) => Promise<PersistedContact>;
};
