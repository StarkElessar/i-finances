import {
	action,
	query,
	revalidate
} from '@solidjs/router';
import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type {
	ApproveReceiptInput,
	ReceiptImportCommandResult,
	RequestReceiptRevisionInput
} from './receipt-import.contract';
import {
	approveReceiptInputSchema,
	requestReceiptRevisionInputSchema
} from './receipt-import.contract';

import {
	getAccountBalances,
	getAccountLedger,
	getMonthlyExpenseSummary
} from '~/entities/operation/api/operation.server';
import type { ReceiptImport } from '~/entities/receipt-import/model/types';
import {
	assertSameOriginMutation,
	InvalidMutationOriginError
} from '~/server/auth/csrf/origin-guard';
import {
	AuthenticationRequiredError,
	requireUser
} from '~/server/auth/require-user';
import { ExchangeRateNotFoundError } from '~/server/exchange-rate/exchange-rate-errors';
import {
	OperationAccountUnavailableError,
	OperationConversionAmountError,
	OperationReferenceUnavailableError
} from '~/server/operation/operation-errors';
import {
	ReceiptImportNotFoundError,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError
} from '~/server/receipt-import/receipt-import-errors';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';

async function readReceiptImports(): Promise<ReceiptImport[]> {
	'use server';

	const session = await requireUser();

	return receiptImportService.list(session.user.id);
}

export const getReceiptImports = query(
	readReceiptImports,
	'receipt-imports'
);

function createFieldErrors(error: z.ZodError): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	error.issues.forEach((issue) => {
		const field = issue.path[0];

		if (typeof field === 'string') {
			fieldErrors[field] = issue.message;
		}
	});

	return fieldErrors;
}

function createCommandFailure(
	error: unknown
): ReceiptImportCommandResult | undefined {
	if (error instanceof AuthenticationRequiredError) {
		return {
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		};
	}

	if (error instanceof InvalidMutationOriginError) {
		return {
			errorCode: 'forbidden',
			message: 'Недостаточно прав для изменения чека.',
			ok: false
		};
	}

	if (error instanceof ReceiptImportNotFoundError) {
		return {
			errorCode: 'not-found',
			message: 'Чек не найден.',
			ok: false
		};
	}

	if (error instanceof ReceiptImportVersionConflictError) {
		return {
			errorCode: 'conflict',
			message: 'Чек уже изменился. Обновите страницу и повторите действие.',
			ok: false
		};
	}

	if (error instanceof ReceiptImportStateError) {
		return {
			errorCode: 'invalid-state',
			message: error.message,
			ok: false
		};
	}

	if (error instanceof ExchangeRateNotFoundError) {
		return {
			errorCode: 'rate-unavailable',
			message: 'Для даты чека не найден курс валют.',
			ok: false
		};
	}

	if (error instanceof OperationReferenceUnavailableError) {
		return {
			errorCode: 'reference-unavailable',
			message: 'Одна из выбранных категорий больше недоступна.',
			ok: false
		};
	}

	if (
		error instanceof OperationAccountUnavailableError
		|| error instanceof OperationConversionAmountError
	) {
		return {
			errorCode: 'invalid-state',
			message: 'Не удалось создать операцию для выбранного счёта.',
			ok: false
		};
	}

	return undefined;
}

async function executeReceiptCommand<TInput>(
	schema: z.ZodType<TInput>,
	input: TInput,
	command: (userId: string, value: TInput) => Promise<ReceiptImport>
): Promise<ReceiptImportCommandResult> {
	const parsedInput = schema.safeParse(input);

	if (!parsedInput.success) {
		return {
			errorCode: 'invalid-input',
			fieldErrors: createFieldErrors(parsedInput.error),
			message: 'Проверьте введённые данные.',
			ok: false
		};
	}

	try {
		assertSameOriginMutation(getWebRequest());

		const session = await requireUser();
		const receiptImport = await command(
			session.user.id,
			parsedInput.data
		);

		await Promise.all([
			revalidate(getReceiptImports.key),
			revalidate(getAccountBalances.key),
			revalidate(getAccountLedger.key),
			revalidate(getMonthlyExpenseSummary.key)
		]);

		return {
			ok: true,
			receiptImport
		};
	}
	catch (error: unknown) {
		const failure = createCommandFailure(error);

		if (failure !== undefined) {
			return failure;
		}

		throw error;
	}
}

async function requestReceiptRevisionCommand(
	input: RequestReceiptRevisionInput
): Promise<ReceiptImportCommandResult> {
	'use server';

	return executeReceiptCommand(
		requestReceiptRevisionInputSchema,
		input,
		receiptImportService.requestRevision
	);
}

async function approveReceiptCommand(
	input: ApproveReceiptInput
): Promise<ReceiptImportCommandResult> {
	'use server';

	return executeReceiptCommand(
		approveReceiptInputSchema,
		input,
		receiptImportService.approve
	);
}

export const requestReceiptRevision = action(
	requestReceiptRevisionCommand,
	'request-receipt-revision'
);
export const approveReceipt = action(
	approveReceiptCommand,
	'approve-receipt'
);
