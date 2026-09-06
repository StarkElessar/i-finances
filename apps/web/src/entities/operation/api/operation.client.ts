import { OperationClient } from '@/features/operations/api';

import { resolveCommandResult } from '@/shared/api';

import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetMonthlyExpenseSummaryInput,
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

export const getMonthlyExpenseSummary = query(
	(input: GetMonthlyExpenseSummaryInput) => client.monthlySummary(input),
	'monthly-expense-summary'
);

export const createOperationAction = action(
	(input: CreateOperationInput) => resolveCommandResult(
		() => client.create(input),
		operationCommandResultSchema
	),
	'create-operation'
);

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
