import { resolveCommandResult } from '@/shared/api';

import { OperationClient } from '@/features/operations/api';

import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetCategoryOperationsInput,
	GetContactOperationsInput,
	GetMonthlyExpenseSummaryInput,
	OperationCommandResult,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from '@i-finances/contracts';
import { operationCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new OperationClient();

export const getAccountLedger = query(
	(input: GetAccountLedgerInput) => client.ledger(input),
	'account-ledger'
);

export const getAccountBalances = query(() => client.balances(), 'account-balances');

export const getCategoryOperations = query(
	(input: GetCategoryOperationsInput) => client.byCategory(input),
	'category-operations'
);

export const getContactOperations = query(
	(input: GetContactOperationsInput) => client.byContact(input),
	'contact-operations'
);

export const getMonthlyExpenseSummary = query(
	(input: GetMonthlyExpenseSummaryInput) => client.monthlySummary(input),
	'monthly-expense-summary'
);

export const getCategoryStats = query(
	(input: GetMonthlyExpenseSummaryInput) => client.categoryStats(input),
	'category-stats'
);

export const getMonthlyTrend = query(() => client.monthlyTrend(), 'monthly-trend');

export const createOperationAction = action(
	(input: CreateOperationInput) => resolveCommandResult(
		() => client.create(input),
		operationCommandResultSchema
	),
	'create-operation'
);

/**
 * Same request as `createOperationAction`, without going through
 * `action()`/`useAction`: this app's actions are plain client functions, not
 * real HTTP `Response`s carrying an `X-Revalidate` header, so solid-router
 * can't tell which queries the mutation affects and invalidates every cached
 * query on the page. Callers that patch the affected caches themselves (see
 * `insertOperationIntoLedger`) use this instead to avoid that blanket refetch.
 */
export function createOperationWithoutRevalidation(
	input: CreateOperationInput
): Promise<OperationCommandResult> {
	return resolveCommandResult(() => client.create(input), operationCommandResultSchema);
}

export const updateOperationAction = action(
	(input: UpdateOperationInput) => resolveCommandResult(
		() => client.update(input),
		operationCommandResultSchema
	),
	'update-operation'
);

export const deleteOperationAction = action(
	(input: ChangeOperationDeletionStateInput) => resolveCommandResult(
		() => client.archive(input),
		operationCommandResultSchema
	),
	'delete-operation'
);

export const restoreOperationAction = action(
	(input: ChangeOperationDeletionStateInput) => resolveCommandResult(
		() => client.restore(input),
		operationCommandResultSchema
	),
	'restore-operation'
);

export const recalculateOperationRateAction = action(
	(input: RecalculateOperationRateInput) => resolveCommandResult(
		() => client.recalculateRate(input),
		operationCommandResultSchema
	),
	'recalculate-operation-rate'
);
