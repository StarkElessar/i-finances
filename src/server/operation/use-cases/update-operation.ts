import { OperationVersionConflictError } from '../operation-errors';
import { toOperation } from '../operation-mappers';
import {
    createOperationRateSnapshot,
    getStoredOperationQuote
} from '../operation-rate';
import type { OperationUseCaseContext } from '../operation-use-case.types';

import {
    type UpdateOperationInput,
    updateOperationInputSchema
} from '~/entities/operation/api/operation.contract';
import type { Operation } from '~/entities/operation/model/types';

export function createUpdateOperationUseCase(
    context: OperationUseCaseContext
) {
    return async (
        userId: string,
        unsafeInput: UpdateOperationInput
    ): Promise<Operation> => {
        const input = updateOperationInputSchema.parse(unsafeInput);
        const household = await context.householdResolver.requireForUser(userId);
        const current = await context.rules.requireCurrent(household.id, input.id);

        context.rules.assertVersion(current, input.version);
        context.rules.assertEditable(current);

        const account = await context.rules.requireAccount(
            household.id,
            current.accountId,
            false
        );
        const references = await context.rules.resolveReferences(
            household.id,
            input.categoryId,
            input.contactId,
            current
        );
        const quote = current.happenedOn === input.happenedOn
            ? getStoredOperationQuote(current)
            : await context.exchangeRateResolver.resolve({
                fromCurrency: account.currency,
                onDate: input.happenedOn,
                toCurrency: household.baseCurrency
            });
        const rateSnapshot = createOperationRateSnapshot(
            input.amountMinor,
            quote,
            account.currency,
            household.baseCurrency
        );
        const updated = await context.operationRepository.update(
            household.id,
            current.id,
            input.version,
            {
                amountInHouseholdBaseCurrencyMinor:
                    rateSnapshot.amountInHouseholdBaseCurrencyMinor,
                amountMinor: input.amountMinor,
                categoryId: references.category?.id ?? null,
                categoryNameSnapshot: getReferenceSnapshot(
                    input.categoryId,
                    current.categoryId,
                    current.categoryNameSnapshot,
                    references.category?.name
                ),
                comment: input.comment,
                contactId: references.contact?.id ?? null,
                contactNameSnapshot: getReferenceSnapshot(
                    input.contactId,
                    current.contactId,
                    current.contactNameSnapshot,
                    references.contact?.name
                ),
                currency: account.currency,
                exchangeRate: quote.rate,
                exchangeRateEffectiveOn: quote.effectiveOn,
                exchangeRateSource: quote.source,
                happenedOn: input.happenedOn,
                householdBaseCurrency: household.baseCurrency,
                title: input.title,
                type: input.type,
                updatedAt: context.now(),
                updatedByUserId: userId
            }
        );

        if (updated === undefined) {
            throw new OperationVersionConflictError();
        }

        return toOperation(updated, {
            categoryName: references.category?.name,
            contactName: references.contact?.name
        });
    };
}

function getReferenceSnapshot(
    nextId: string | null,
    currentId: string | null,
    currentSnapshot: string | null,
    nextName?: string
): string | null {
    if (nextId === null) {
        return null;
    }

    return nextId === currentId
        ? currentSnapshot
        : nextName ?? null;
}
