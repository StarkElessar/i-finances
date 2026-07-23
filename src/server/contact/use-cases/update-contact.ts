import { ContactVersionConflictError } from '../contact-errors';
import { toPersistedContact } from '../contact-mappers';
import type { ContactService } from '../contact-service.types';
import type { ContactUseCaseContext } from '../contact-use-case.types';

import {
    normalizeContactIdentity,
    normalizeContactLegalName,
    normalizeContactName
} from '~/entities/contact/model/normalization';

/**
 * Creates the command that updates a contact using optimistic locking.
 */
export function createUpdateContactUseCase(
    context: Pick<
        ContactUseCaseContext,
        'contactRepository' | 'now' | 'rules'
    >
): ContactService['update'] {
    return async (userId, input) => {
        const current = await context.rules.requireCurrent(userId, input.id);
        const name = normalizeContactName(input.name);
        const legalName = input.type === 'company'
            ? normalizeContactLegalName(input.legalName)
            : null;

        context.rules.assertVersion(current.record, input.version);
        await context.rules.assertNameAvailable(
            current.householdId,
            name,
            input.id
        );

        const record = await context.contactRepository.update(
            current.householdId,
            input.id,
            input.version,
            {
                color: input.color,
                legalName,
                name,
                normalizedLegalName: legalName
                    ? normalizeContactIdentity(legalName)
                    : null,
                normalizedName: normalizeContactIdentity(name),
                type: input.type,
                updatedAt: context.now()
            }
        );

        if (record === undefined) {
            throw new ContactVersionConflictError();
        }

        return toPersistedContact(record);
    };
}
