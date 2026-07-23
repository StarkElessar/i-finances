import { toPersistedContact } from '../contact-mappers';
import type { ContactService } from '../contact-service.types';
import type { ContactUseCaseContext } from '../contact-use-case.types';

/**
 * Creates the query that lists contacts belonging to the active household.
 */
export function createListContactsUseCase(
    context: Pick<
        ContactUseCaseContext,
        'contactRepository' | 'householdResolver'
    >
): ContactService['list'] {
    return async (userId, status) => {
        const household = await context.householdResolver.requireForUser(userId);
        const records = await context.contactRepository.list(
            household.id,
            status
        );

        return {
            baseCurrency: household.baseCurrency,
            items: records.map(toPersistedContact)
        };
    };
}
