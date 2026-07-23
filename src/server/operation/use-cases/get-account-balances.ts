import type { OperationUseCaseContext } from '../operation-use-case.types';

import type { AccountBalance } from '~/entities/operation/model/types';

export function createGetAccountBalancesUseCase(
    context: OperationUseCaseContext
) {
    return async (userId: string): Promise<AccountBalance[]> => {
        const household = await context.householdResolver.requireForUser(userId);
        const accounts = await context.accountRepository.list(
            household.id,
            false
        );
        const operationTotals = await context.operationRepository
            .getSignedTotalsByAccount(
                household.id,
                accounts.map((account) => account.id)
            );

        return accounts.map((account) => {
            const balanceMinor = account.initialBalanceMinor
                + (operationTotals.get(account.id) ?? 0);

            if (!Number.isSafeInteger(balanceMinor)) {
                throw new Error('Account balance exceeds the safe integer range.');
            }

            return {
                accountId: account.id,
                balanceMinor,
                currency: account.currency
            };
        });
    };
}
