import type { AuthenticatedSession } from '@/modules/auth';
import { ExchangeRateNotFoundError } from '@/modules/exchange-rate';
import {
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '@/modules/household';
import type { TransferService } from '@/modules/transfer';
import {
	TransferAccountsInvalidError,
	TransferAccountUnavailableError,
	TransferConversionAmountError,
	TransferDeletedError,
	TransferNotFoundError,
	TransferReferenceUnavailableError,
	TransferVersionConflictError
} from '@/modules/transfer';

import type { TransferCommandResult } from '@i-finances/contracts';
import {
	changeTransferDeletionStateInputSchema,
	createTransferInputSchema,
	getTransferInputSchema,
	updateTransferInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class TransferHttpController {
	public constructor(
		private readonly transferService: TransferService,
		private readonly sessionResolver: RequestSessionResolver
	) {}

	public get() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getTransferInputSchema.safeParse({
				id: context.req.param('id')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json<TransferCommandResult>({
					ok: true,
					transfer: await this.transferService.getById(session.user.id, parsedInput.data)
				}, 200);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public create() {
		return this.mutation(
			createTransferInputSchema,
			(userId, input) => this.transferService.create(userId, input),
			() => undefined
		);
	}

	public update() {
		return this.mutation(
			updateTransferInputSchema,
			(userId, input) => this.transferService.update(userId, input),
			(context) => context.req.param('id')
		);
	}

	public delete() {
		return this.mutation(
			changeTransferDeletionStateInputSchema,
			(userId, input) => this.transferService.softDelete(userId, input),
			(context) => context.req.param('id')
		);
	}

	private mutation<TInput>(
		schema: { safeParse(value: unknown): z.ZodSafeParseResult<TInput> },
		run: (userId: string, input: TInput) => Promise<unknown>,
		readId: (context: Context<ApiEnvironment>) => string | undefined
	) {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw)) {
				return this.failure(context, 'forbidden', 'Не удалось подтвердить источник запроса.', 403);
			}

			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const body = await this.readBody(context);
			const id = readId(context);
			const parsedInput = schema.safeParse(
				id === undefined || typeof body !== 'object' || body === null
					? body
					: { ...body, id }
			);

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json<TransferCommandResult>({
					ok: true,
					transfer: await run(session.user.id, parsedInput.data) as never
				}, 200);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	private async requireSession(
		context: Context<ApiEnvironment>
	): Promise<AuthenticatedSession | undefined> {
		return await this.sessionResolver.resolve(context.req.raw) ?? undefined;
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private invalidInput(
		context: Context<ApiEnvironment>,
		error: z.ZodError
	): Response {
		const fieldErrors: Record<string, string> = {};

		error.issues.forEach((issue) => {
			const field = issue.path[0];

			if (typeof field === 'string') {
				fieldErrors[field] = issue.message;
			}
		});

		return context.json<TransferCommandResult>({
			errorCode: 'invalid-input',
			fieldErrors,
			message: 'Проверьте поля перевода.',
			ok: false
		}, 400);
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return this.failure(context, 'unauthenticated', 'Требуется войти в приложение.', 401);
	}

	private domainFailure(context: Context<ApiEnvironment>, error: unknown): Response {
		if (error instanceof TransferAccountsInvalidError) {
			return context.json<TransferCommandResult>({
				errorCode: 'invalid-input',
				fieldErrors: { [error.field]: error.message },
				message: error.message,
				ok: false
			}, 400);
		}

		if (error instanceof TransferAccountUnavailableError) {
			return this.failure(context, 'reference-unavailable', 'Счёт недоступен.', 400);
		}

		if (error instanceof TransferReferenceUnavailableError) {
			return this.failure(context, 'reference-unavailable', 'Контакт недоступен.', 400);
		}

		if (error instanceof TransferConversionAmountError) {
			return this.failure(context, 'invalid-input', 'Не удалось пересчитать сумму перевода.', 400);
		}

		if (error instanceof ExchangeRateNotFoundError) {
			return this.failure(context, 'rate-unavailable', 'Курс обмена недоступен.', 409);
		}

		if (error instanceof TransferDeletedError) {
			return this.failure(context, 'invalid-state', 'Перевод удалён.', 409);
		}

		if (
			error instanceof TransferVersionConflictError
			|| error instanceof HouseholdSelectionRequiredError
		) {
			return this.failure(
				context,
				'conflict',
				'Данные изменились. Обновите страницу и повторите действие.',
				409
			);
		}

		if (error instanceof TransferNotFoundError) {
			return this.failure(context, 'not-found', 'Перевод не найден.', 404);
		}

		if (error instanceof HouseholdAccessRequiredError) {
			return this.failure(context, 'forbidden', 'Нет доступа к семье.', 403);
		}

		throw error;
	}

	private failure(
		context: Context<ApiEnvironment>,
		errorCode: Exclude<TransferCommandResult, { ok: true }>['errorCode'],
		message: string,
		status: 400 | 401 | 403 | 404 | 409
	): Response {
		return context.json<TransferCommandResult>({
			errorCode,
			message,
			ok: false
		}, status);
	}
}
