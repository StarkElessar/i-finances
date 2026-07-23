import { OperationVersionConflictError } from '../operation-errors';
import { toOperation } from '../operation-mappers';
import { createOperationRateSnapshot } from '../operation-rate';
import type { OperationUseCaseContext } from '../operation-use-case.types';

import {
    type RecalculateOperationRateInput,
    recalculateOperationRateInputSchema
} from '~/entities/operation/api/operation.contract';
import type { Operation } from '~/entities/operation/model/types';

export function createRecalculateOperationRateUseCase(
    context: OperationUseCaseContext
) {
    return async (
        userId: string,
        unsafeInput: RecalculateOperationRateInput
    ): Promise<Operation> => {
        const input = recalculateOperationRateInputSchema.parse(unsafeInput);
        const household = await context.householdResolver.requireForUser(userId);
        const current = await context.rules.requireCurrent(household.id, input.id);

        context.rules.assertVersion(current, input.version);
        context.rules.assertEditable(current);

        const account = await context.rules.requireAccount(
            household.id,
            current.accountId,
            false
        );
        const quote = await context.exchangeRateResolver.resolve({
            fromCurrency: account.currency,
            onDate: current.happenedOn,
            toCurrency: household.baseCurrency
        });
        const rateSnapshot = createOperationRateSnapshot(
            current.amountMinor,
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
                amountMinor: current.amountMinor,
                categoryId: current.categoryId,
                categoryNameSnapshot: current.categoryNameSnapshot,
                comment: current.comment,
                contactId: current.contactId,
                contactNameSnapshot: current.contactNameSnapshot,
                currency: account.currency,
                exchangeRate: quote.rate,
                exchangeRateEffectiveOn: quote.effectiveOn,
                exchangeRateSource: quote.source,
                happenedOn: current.happenedOn,
                householdBaseCurrency: household.baseCurrency,
                title: current.title,
                type: current.type,
                updatedAt: context.now(),
                updatedByUserId: userId
            }
        );

        if (updated === undefined) {
            throw new OperationVersionConflictError();
        }

        return toOperation(updated);
    };
}
