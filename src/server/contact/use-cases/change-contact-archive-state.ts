import { ContactVersionConflictError } from '../contact-errors';
import { toPersistedContact } from '../contact-mappers';
import type { ContactService } from '../contact-service.types';
import type { ContactUseCaseContext } from '../contact-use-case.types';

/**
 * Creates an archive-state command shared by archive and restore operations.
 */
export function createChangeContactArchiveStateUseCase(
    context: Pick<
        ContactUseCaseContext,
        'contactRepository' | 'now' | 'rules'
    >,
    targetArchived: boolean
): ContactService['archive'] {
    return async (userId, input) => {
        const current = await context.rules.requireCurrent(userId, input.id);

        context.rules.assertVersion(current.record, input.version);

        const currentlyArchived = current.record.archivedAt !== null;

        if (currentlyArchived === targetArchived) {
            return toPersistedContact(current.record);
        }

        const timestamp = context.now();
        const record = await context.contactRepository.setArchivedAt(
            current.householdId,
            input.id,
            input.version,
            targetArchived ? timestamp : null,
            timestamp
        );

        if (record === undefined) {
            throw new ContactVersionConflictError();
        }

        return toPersistedContact(record);
    };
}
