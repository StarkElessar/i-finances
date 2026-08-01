import { ContactNameConflictError } from '../contact-errors';
import { toPersistedContact } from '../contact-mappers';
import type { ContactService } from '../contact-service.types';
import type { ContactUseCaseContext } from '../contact-use-case.types';

import {
	normalizeContactIdentity,
	normalizeContactLegalName,
	normalizeContactName
} from '~/entities/contact/model/normalization';

/**
 * Creates the command that persists a contact in the active household.
 */
export function createCreateContactUseCase(
	context: ContactUseCaseContext
): ContactService['create'] {
	return async (userId, input) => {
		const household = await context.householdResolver.requireForUser(userId);
		const contactId = context.createId();
		const timestamp = context.now();
		const name = normalizeContactName(input.name);
		const legalName = input.type === 'company'
			? normalizeContactLegalName(input.legalName)
			: null;

		await context.rules.assertNameAvailable(household.id, name);

		const record = await context.contactRepository.insert({
			archivedAt: null,
			color: input.color,
			createdAt: timestamp,
			createdByUserId: userId,
			householdId: household.id,
			id: contactId,
			legalName,
			name,
			normalizedLegalName: legalName
				? normalizeContactIdentity(legalName)
				: null,
			normalizedName: normalizeContactIdentity(name),
			type: input.type,
			updatedAt: timestamp,
			version: 1
		});

		if (record === undefined) {
			throw new ContactNameConflictError();
		}

		return toPersistedContact(record);
	};
}
