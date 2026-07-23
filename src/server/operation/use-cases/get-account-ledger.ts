import { toOperation } from '../operation-mappers';
import type { OperationUseCaseContext } from '../operation-use-case.types';

import {
    type GetAccountLedgerInput,
    getAccountLedgerInputSchema
} from '~/entities/operation/api/operation.contract';
import type {
    AccountLedger,
    OperationWithBalance
} from '~/entities/operation/model/types';

export function createGetAccountLedgerUseCase(
    context: OperationUseCaseContext
) {
    return async (
        userId: string,
        unsafeInput: GetAccountLedgerInput
    ): Promise<AccountLedger> => {
        const input = getAccountLedgerInputSchema.parse(unsafeInput);
        const household = await context.householdResolver.requireForUser(userId);
        const account = await context.rules.requireAccount(
            household.id,
            input.accountId,
            false
        );
        const [signedTotalBefore, rows] = await Promise.all([
            context.operationRepository.getSignedTotalBefore(
                household.id,
                account.id,
                input.start
            ),
            context.operationRepository.listLedger(
                household.id,
                account.id,
                input.start,
                input.end
            )
        ]);
        const openingBalanceMinor = addSafeMinorUnits(
            account.initialBalanceMinor,
            signedTotalBefore
        );
        let runningBalanceMinor = openingBalanceMinor;
        const items: OperationWithBalance[] = rows.map((row) => {
            const operation = toOperation(row.operation, {
                categoryName: row.categoryName,
                contactName: row.contactName
            });
            const signedAmountMinor = operation.type === 'expense'
                ? -operation.amountMinor
                : operation.amountMinor;

            runningBalanceMinor = addSafeMinorUnits(
                runningBalanceMinor,
                signedAmountMinor
            );

            return {
                ...operation,
                balanceAfterMinor: runningBalanceMinor,
                signedAmountMinor
            };
        });

        return {
            accountCurrency: account.currency,
            accountId: account.id,
            closingBalanceMinor: runningBalanceMinor,
            householdBaseCurrency: household.baseCurrency,
            items,
            openingBalanceMinor,
            range: {
                end: input.end,
                start: input.start
            }
        };
    };
}

function addSafeMinorUnits(left: number, right: number): number {
    const result = left + right;

    if (!Number.isSafeInteger(result)) {
        throw new Error('Ledger balance exceeds the safe integer range.');
    }

    return result;
}
