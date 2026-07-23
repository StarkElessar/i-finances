import { randomUUID } from 'node:crypto';

import { createChangeOperationDeletionStateUseCase } from './use-cases/change-operation-deletion-state';
import { createCreateOperationUseCase } from './use-cases/create-operation';
import { createGetAccountBalancesUseCase } from './use-cases/get-account-balances';
import { createGetAccountLedgerUseCase } from './use-cases/get-account-ledger';
import { createGetMonthlyExpenseSummaryUseCase } from './use-cases/get-monthly-expense-summary';
import { createRecalculateOperationRateUseCase } from './use-cases/recalculate-operation-rate';
import { createUpdateOperationUseCase } from './use-cases/update-operation';
import { createOperationRules } from './operation-rules';
import type {
    OperationService,
    OperationServiceDependencies
} from './operation-service.types';

export type {
    OperationService,
    OperationServiceDependencies
} from './operation-service.types';

/**
 * Composes operation use cases from injected domain and persistence adapters.
 */
export function createOperationService(
    dependencies: OperationServiceDependencies
): OperationService {
    const context = {
        accountRepository: dependencies.accountRepository,
        createId: dependencies.createId ?? randomUUID,
        exchangeRateResolver: dependencies.exchangeRateResolver,
        householdResolver: dependencies.householdResolver,
        now: dependencies.now ?? (() => new Date()),
        operationRepository: dependencies.operationRepository,
        rules: createOperationRules(dependencies)
    };

    return {
        create: createCreateOperationUseCase(context),
        getAccountBalances: createGetAccountBalancesUseCase(context),
        getAccountLedger: createGetAccountLedgerUseCase(context),
        getMonthlyExpenseSummary:
            createGetMonthlyExpenseSummaryUseCase(context),
        recalculateRate: createRecalculateOperationRateUseCase(context),
        restore: createChangeOperationDeletionStateUseCase(context, false),
        softDelete: createChangeOperationDeletionStateUseCase(context, true),
        update: createUpdateOperationUseCase(context)
    };
}
