import { action, query, revalidate } from '@solidjs/router';

import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetMonthlyExpenseSummaryInput,
	OperationCommandResult,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from './operation.contract';
import {
	changeOperationDeletionStateInputSchema,
	createOperationInputSchema,
	getAccountLedgerInputSchema,
	getMonthlyExpenseSummaryInputSchema,
	recalculateOperationRateInputSchema,
	updateOperationInputSchema
} from './operation.contract';
import { createOperationCommandExecutor } from './operation-command';

import type {
	AccountBalance,
	AccountLedger,
	MonthlyExpenseSummary
} from '~/entities/operation/model/types';
import { createAccountRepository } from '~/server/account/account-repository';
import { requireUser } from '~/server/auth/require-user';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createContactRepository } from '~/server/contact/contact-repository';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import {
	createHouseholdResolver
} from '~/server/household/household-service';
import { createOperationRepository } from '~/server/operation/operation-repository';
import { createOperationService } from '~/server/operation/operation-service';

const householdResolver = createHouseholdResolver(createHouseholdRepository());
const operationService = createOperationService({
	accountRepository: createAccountRepository(),
	categoryRepository: createCategoryRepository(),
	contactRepository: createContactRepository(),
	exchangeRateResolver: createExchangeRateService({
		exchangeRateRepository: createExchangeRateRepository()
	}),
	householdResolver,
	operationRepository: createOperationRepository()
});

async function readAccountLedger(
	input: GetAccountLedgerInput
): Promise<AccountLedger> {
	'use server';

	const parsedInput = getAccountLedgerInputSchema.parse(input);
	const session = await requireUser();

	return operationService.getAccountLedger(session.user.id, parsedInput);
}

async function readAccountBalances(): Promise<AccountBalance[]> {
	'use server';

	const session = await requireUser();

	return operationService.getAccountBalances(session.user.id);
}

async function readMonthlyExpenseSummary(
	input: GetMonthlyExpenseSummaryInput
): Promise<MonthlyExpenseSummary> {
	'use server';

	const parsedInput = getMonthlyExpenseSummaryInputSchema.parse(input);
	const session = await requireUser();

	return operationService.getMonthlyExpenseSummary(
		session.user.id,
		parsedInput
	);
}

export const getAccountLedger = query(readAccountLedger, 'account-ledger');
export const getAccountBalances = query(readAccountBalances, 'account-balances');
export const getMonthlyExpenseSummary = query(
	readMonthlyExpenseSummary,
	'monthly-expense-summary'
);

async function revalidateOperationQueries(): Promise<void> {
	await Promise.all([
		revalidate(getAccountLedger.key),
		revalidate(getAccountBalances.key),
		revalidate(getMonthlyExpenseSummary.key)
	]);
}

const executeOperationCommand = createOperationCommandExecutor({
	revalidateQueries: revalidateOperationQueries
});

async function createOperationCommand(
	input: CreateOperationInput
): Promise<OperationCommandResult> {
	'use server';

	return executeOperationCommand(
		createOperationInputSchema,
		input,
		operationService.create
	);
}

async function updateOperationCommand(
	input: UpdateOperationInput
): Promise<OperationCommandResult> {
	'use server';

	return executeOperationCommand(
		updateOperationInputSchema,
		input,
		operationService.update
	);
}

async function deleteOperationCommand(
	input: ChangeOperationDeletionStateInput
): Promise<OperationCommandResult> {
	'use server';

	return executeOperationCommand(
		changeOperationDeletionStateInputSchema,
		input,
		operationService.softDelete
	);
}

async function restoreOperationCommand(
	input: ChangeOperationDeletionStateInput
): Promise<OperationCommandResult> {
	'use server';

	return executeOperationCommand(
		changeOperationDeletionStateInputSchema,
		input,
		operationService.restore
	);
}

async function recalculateOperationRateCommand(
	input: RecalculateOperationRateInput
): Promise<OperationCommandResult> {
	'use server';

	return executeOperationCommand(
		recalculateOperationRateInputSchema,
		input,
		operationService.recalculateRate
	);
}

export const createOperationAction = action(
	createOperationCommand,
	'create-operation'
);
export const updateOperationAction = action(
	updateOperationCommand,
	'update-operation'
);
export const deleteOperationAction = action(
	deleteOperationCommand,
	'delete-operation'
);
export const restoreOperationAction = action(
	restoreOperationCommand,
	'restore-operation'
);
export const recalculateOperationRateAction = action(
	recalculateOperationRateCommand,
	'recalculate-operation-rate'
);
