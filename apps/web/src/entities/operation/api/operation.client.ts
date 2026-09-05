import { OperationClient } from '@/features/operations/api';

import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetMonthlyExpenseSummaryInput,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from '@i-finances/contracts';
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
	(input: CreateOperationInput) => client.create(input),
	'create-operation'
);

export const updateOperationAction = action(
	(input: UpdateOperationInput) => client.update(input),
	'update-operation'
);

export const deleteOperationAction = action(
	(input: ChangeOperationDeletionStateInput) => client.archive(input),
	'delete-operation'
);

export const restoreOperationAction = action(
	(input: ChangeOperationDeletionStateInput) => client.restore(input),
	'restore-operation'
);

export const recalculateOperationRateAction = action(
	(input: RecalculateOperationRateInput) => client.recalculateRate(input),
	'recalculate-operation-rate'
);
