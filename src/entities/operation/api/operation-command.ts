import type { Operation } from '~/entities/operation/model/types';

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
	OperationAccountUnavailableError,
	OperationConversionAmountError,
	OperationDeletedError,
	OperationNotFoundError,
	OperationReferenceUnavailableError,
	OperationVersionConflictError
} from '~/server/operation/operation-errors';

import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type { OperationCommandResult } from './operation.contract';

export type OperationCommandExecutorDependencies = {
	revalidateQueries: () => Promise<void>;
};

/**
 * Creates the authenticated transport adapter shared by operation actions.
 */
export function createOperationCommandExecutor(
	dependencies: OperationCommandExecutorDependencies
) {
	return async function executeOperationCommand<TInput>(
		schema: z.ZodType<TInput>,
		input: TInput,
		command: (userId: string, value: TInput) => Promise<Operation>
	): Promise<OperationCommandResult> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return {
				errorCode: 'invalid-input',
				fieldErrors: createFieldErrors(parsedInput.error),
				message: 'Проверьте поля операции.',
				ok: false
			};
		}

		try {
			assertSameOriginMutation(getWebRequest());

			const session = await requireUser();
			const operation = await command(
				session.user.id,
				parsedInput.data
			);

			await dependencies.revalidateQueries();

			return {
				ok: true,
				operation
			};
		}
		catch (error: unknown) {
			const failure = createOperationFailure(error);

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

function createOperationFailure(
	error: unknown
): OperationCommandResult | undefined {
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
			message: 'Недостаточно прав для изменения операций.',
			ok: false
		};
	}

	if (
		error instanceof OperationVersionConflictError
		|| error instanceof HouseholdSelectionRequiredError
	) {
		return {
			errorCode: 'conflict',
			message: 'Операция изменилась. Обновите данные и повторите действие.',
			ok: false
		};
	}

	if (error instanceof OperationNotFoundError) {
		return {
			errorCode: 'not-found',
			message: 'Операция не найдена.',
			ok: false
		};
	}

	if (error instanceof ExchangeRateNotFoundError) {
		return {
			errorCode: 'rate-unavailable',
			message: 'Для даты операции отсутствует подходящий курс валют.',
			ok: false
		};
	}

	if (error instanceof OperationReferenceUnavailableError) {
		return {
			errorCode: 'reference-unavailable',
			fieldErrors: {
				[error.field]: 'Выбранная запись недоступна.'
			},
			message: 'Выберите активную категорию или контакт.',
			ok: false
		};
	}

	if (
		error instanceof OperationAccountUnavailableError
		|| error instanceof OperationDeletedError
	) {
		return {
			errorCode: 'invalid-state',
			message: 'Операция недоступна для этого действия.',
			ok: false
		};
	}

	if (error instanceof OperationConversionAmountError) {
		return {
			errorCode: 'invalid-input',
			fieldErrors: {
				amountMinor: 'Сумма после конвертации слишком мала.'
			},
			message: 'Проверьте сумму операции.',
			ok: false
		};
	}

	return undefined;
}
