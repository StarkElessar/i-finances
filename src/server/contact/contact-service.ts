import { randomUUID } from 'node:crypto';

import { createChangeContactArchiveStateUseCase } from './use-cases/change-contact-archive-state';
import { createCreateContactUseCase } from './use-cases/create-contact';
import { createListContactsUseCase } from './use-cases/list-contacts';
import { createUpdateContactUseCase } from './use-cases/update-contact';
import { createContactRules } from './contact-rules';
import type {
	ContactService,
	ContactServiceDependencies
} from './contact-service.types';

export type {
	ContactService,
	ContactServiceDependencies
} from './contact-service.types';

/**
 * Creates the contact application service with injectable infrastructure.
 */
export function createContactService(
	dependencies: ContactServiceDependencies
): ContactService {
	const context = {
		contactRepository: dependencies.contactRepository,
		createId: dependencies.createId ?? randomUUID,
		householdResolver: dependencies.householdResolver,
		now: dependencies.now ?? (() => new Date()),
		rules: createContactRules(
			dependencies.contactRepository,
			dependencies.householdResolver
		)
	};

	return {
		archive: createChangeContactArchiveStateUseCase(context, true),
		create: createCreateContactUseCase(context),
		list: createListContactsUseCase(context),
		restore: createChangeContactArchiveStateUseCase(context, false),
		update: createUpdateContactUseCase(context)
	};
}
