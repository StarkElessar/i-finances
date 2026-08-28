import type { Transfer } from '~/entities/transfer/model/types';

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
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '~/server/household/household-service';
import {
	TransferAccountsInvalidError,
	TransferAccountUnavailableError,
	TransferConversionAmountError,
	TransferDeletedError,
	TransferNotFoundError,
	TransferReferenceUnavailableError,
	TransferVersionConflictError
} from '~/server/transfer/transfer-errors';

import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type { TransferCommandResult } from './transfer.contract';

export type TransferCommandExecutorDependencies = {
	revalidateQueries: () => Promise<void>;
};

/**
 * Creates the authenticated transport adapter shared by transfer actions.
 */
export function createTransferCommandExecutor(
	dependencies: TransferCommandExecutorDependencies
) {
	return async function executeTransferCommand<TInput>(
		schema: z.ZodType<TInput>,
		input: TInput,
		command: (userId: string, value: TInput) => Promise<Transfer>
	): Promise<TransferCommandResult> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return {
				errorCode: 'invalid-input',
				fieldErrors: createFieldErrors(parsedInput.error),
				message: 'Проверьте поля перевода.',
				ok: false
			};
		}

		try {
			assertSameOriginMutation(getWebRequest());

			const session = await requireUser();
			const transfer = await command(
				session.user.id,
				parsedInput.data
			);

			await dependencies.revalidateQueries();

			return {
				ok: true,
				transfer
			};
		}
		catch (error: unknown) {
			const failure = createTransferFailure(error);

			if (failure !== undefined) {
				return failure;
			}

			throw error;
		}
	};
}

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

function createTransferFailure(
	error: unknown
): TransferCommandResult | undefined {
	if (error instanceof AuthenticationRequiredError) {
		return {
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		};
	}

	if (
		error instanceof InvalidMutationOriginError
		|| error instanceof HouseholdAccessRequiredError
	) {
		return {
			errorCode: 'forbidden',
			message: 'Недостаточно прав для изменения переводов.',
			ok: false
		};
	}

	if (
		error instanceof TransferVersionConflictError
		|| error instanceof HouseholdSelectionRequiredError
	) {
		return {
			errorCode: 'conflict',
			message: 'Перевод изменился. Обновите данные и повторите действие.',
			ok: false
		};
	}

	if (error instanceof TransferNotFoundError) {
		return {
			errorCode: 'not-found',
			message: 'Перевод не найден.',
			ok: false
		};
	}

	if (error instanceof ExchangeRateNotFoundError) {
		return {
			errorCode: 'rate-unavailable',
			message: 'Для даты перевода отсутствует подходящий курс валют.',
			ok: false
		};
	}

	if (error instanceof TransferReferenceUnavailableError) {
		return {
			errorCode: 'reference-unavailable',
			fieldErrors: {
				contactId: 'Выбранный контакт недоступен.'
			},
			message: 'Выберите активный контакт.',
			ok: false
		};
	}

	if (error instanceof TransferAccountsInvalidError) {
		return {
			errorCode: 'invalid-input',
			fieldErrors: {
				[error.field]: error.message
			},
			message: error.message,
			ok: false
		};
	}

	if (
		error instanceof TransferAccountUnavailableError
		|| error instanceof TransferDeletedError
	) {
		return {
			errorCode: 'invalid-state',
			message: 'Перевод недоступен для этого действия.',
			ok: false
		};
	}

	if (error instanceof TransferConversionAmountError) {
		return {
			errorCode: 'invalid-input',
			fieldErrors: {
				exchangeRate: 'Проверьте курс обмена.',
				fromAmountMinor: 'Сумма после конвертации слишком мала.'
			},
			message: 'Проверьте сумму и курс перевода.',
			ok: false
		};
	}

	return undefined;
}
