import {
	getAccountBalances,
	getAccountLedger,
	getMonthlyExpenseSummary
} from '~/entities/operation/api/operation.server';
import type { Transfer } from '~/entities/transfer/model/types';

import { createAccountRepository } from '~/server/account/account-repository';
import { requireUser } from '~/server/auth/require-user';
import { createContactRepository } from '~/server/contact/contact-repository';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { createTransferRepository } from '~/server/transfer/transfer-repository';
import { createTransferService } from '~/server/transfer/transfer-service';

import { action, query, revalidate } from '@solidjs/router';

import type {
	ChangeTransferDeletionStateInput,
	CreateTransferInput,
	GetTransferInput,
	TransferCommandResult,
	UpdateTransferInput
} from './transfer.contract';
import {
	changeTransferDeletionStateInputSchema,
	createTransferInputSchema,
	getTransferInputSchema,
	updateTransferInputSchema
} from './transfer.contract';
import { createTransferCommandExecutor } from './transfer-command';

const householdResolver = createHouseholdResolver(createHouseholdRepository());
const transferService = createTransferService({
	accountRepository: createAccountRepository(),
	contactRepository: createContactRepository(),
	exchangeRateResolver: createExchangeRateService({
		exchangeRateRepository: createExchangeRateRepository()
	}),
	householdResolver,
	transferRepository: createTransferRepository()
});

async function readTransfer(input: GetTransferInput): Promise<Transfer> {
	'use server';

	const parsedInput = getTransferInputSchema.parse(input);
	const session = await requireUser();

	return transferService.getById(session.user.id, parsedInput);
}

export const getTransfer = query(readTransfer, 'transfer');

async function revalidateTransferQueries(): Promise<void> {
	await Promise.all([
		revalidate(getAccountLedger.key),
		revalidate(getAccountBalances.key),
		revalidate(getMonthlyExpenseSummary.key),
		revalidate(getTransfer.key)
	]);
}

const executeTransferCommand = createTransferCommandExecutor({
	revalidateQueries: revalidateTransferQueries
});

async function createTransferCommand(
	input: CreateTransferInput
): Promise<TransferCommandResult> {
	'use server';

	return executeTransferCommand(
		createTransferInputSchema,
		input,
		transferService.create
	);
}

async function updateTransferCommand(
	input: UpdateTransferInput
): Promise<TransferCommandResult> {
	'use server';

	return executeTransferCommand(
		updateTransferInputSchema,
		input,
		transferService.update
	);
}

async function deleteTransferCommand(
	input: ChangeTransferDeletionStateInput
): Promise<TransferCommandResult> {
	'use server';

	return executeTransferCommand(
		changeTransferDeletionStateInputSchema,
		input,
		transferService.softDelete
	);
}

export const createTransferAction = action(
	createTransferCommand,
	'create-transfer'
);
export const updateTransferAction = action(
	updateTransferCommand,
	'update-transfer'
);
export const deleteTransferAction = action(
	deleteTransferCommand,
	'delete-transfer'
);
