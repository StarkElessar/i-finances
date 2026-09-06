import type { AuthenticatedSession } from '@/modules/auth';
import { ExchangeRateNotFoundError } from '@/modules/exchange-rate';
import {
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '@/modules/household';
import type { OperationService } from '@/modules/operation';
import {
	OperationAccountUnavailableError,
	OperationConversionAmountError,
	OperationDeletedError,
	OperationNotFoundError,
	OperationReferenceUnavailableError,
	OperationTransferLinkedError,
	OperationVersionConflictError
} from '@/modules/operation';

import {
	changeOperationDeletionStateInputSchema,
	type CreateOperationInput,
	createOperationInputSchema,
	getAccountLedgerInputSchema,
	getCategoryOperationsInputSchema,
	getContactOperationsInputSchema,
	getMonthlyExpenseSummaryInputSchema,
	type PersistedOperation,
	recalculateOperationRateInputSchema,
	type UpdateOperationInput,
	updateOperationInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class OperationHttpController {
	public constructor(
		private readonly operationService: OperationService,
		private readonly sessionResolver: RequestSessionResolver
	) {}

	public balances() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			try {
				return context.json(await this.operationService.getAccountBalances(session.user.id), 200);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public ledger() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getAccountLedgerInputSchema.safeParse({
				accountId: context.req.query('accountId'),
				end: context.req.query('end'),
				start: context.req.query('start')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getAccountLedger(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public categoryOperations() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getCategoryOperationsInputSchema.safeParse({
				categoryId: context.req.query('categoryId'),
				end: context.req.query('end'),
				start: context.req.query('start')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getCategoryOperations(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public contactOperations() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getContactOperationsInputSchema.safeParse({
				contactId: context.req.query('contactId'),
				end: context.req.query('end'),
				start: context.req.query('start')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getContactOperations(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public monthlySummary() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getMonthlyExpenseSummaryInputSchema.safeParse({
				month: context.req.query('month')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getMonthlyExpenseSummary(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public create() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				await this.readBody(context),
				createOperationInputSchema,
				(input: CreateOperationInput, userId: string) => this.operationService.create(userId, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				this.withPathId(context, await this.readBody(context)),
				updateOperationInputSchema,
				(input: UpdateOperationInput, userId: string) => this.operationService.update(userId, input)
			);
		};
	}

	public archive() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				this.withPathId(context, await this.readBody(context)),
				changeOperationDeletionStateInputSchema,
				(input, userId) => this.operationService.archive(userId, input)
			);
		};
	}

	public restore() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				this.withPathId(context, await this.readBody(context)),
				changeOperationDeletionStateInputSchema,
				(input, userId) => this.operationService.restore(userId, input)
			);
		};
	}

	public recalculateRate() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				this.withPathId(context, await this.readBody(context)),
				recalculateOperationRateInputSchema,
				(input, userId) => this.operationService.recalculateRate(userId, input)
			);
		};
	}

	private async executeMutation<TInput>(
		context: Context<ApiEnvironment>,
		input: unknown,
		schema: z.ZodType<TInput>,
		command: (input: TInput, userId: string) => Promise<PersistedOperation>
	): Promise<Response> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return this.invalidInput(context, parsedInput.error);
		}

		if (!isSameOriginMutation(context.req.raw)) {
			return context.json({
				errorCode: 'forbidden',
				message: 'Недопустимый источник запроса.',
				ok: false
			}, 403);
		}

		const session = await this.requireSession(context);

		if (session === undefined) {
			return this.unauthenticated(context);
		}

		try {
			return context.json({
				operation: await command(parsedInput.data, session.user.id),
				ok: true
			}, 200);
		}
		catch (error: unknown) {
			return this.domainFailure(context, error);
		}
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

	private withPathId(
		context: Context<ApiEnvironment>,
		body: unknown
	): unknown {
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return body;
		}

		return {
			...(body as Record<string, unknown>),
			id: context.req.param('id')
		};
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

		return context.json({
			errorCode: 'invalid-input',
			fieldErrors,
			message: 'Проверьте поля операции.',
			ok: false
		}, 400);
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return context.json({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		}, 401);
	}

	private domainFailure(
		context: Context<ApiEnvironment>,
		error: unknown
	): Response {
		if (error instanceof OperationReferenceUnavailableError) {
			return context.json({
				errorCode: 'reference-unavailable',
				fieldErrors: { [error.field]: 'Выбранная ссылка недоступна.' },
				message: 'Выбранная категория или контакт недоступны.',
				ok: false
			}, 409);
		}

		if (error instanceof OperationVersionConflictError || error instanceof HouseholdSelectionRequiredError) {
			return context.json({
				errorCode: 'conflict',
				message: 'Данные операции изменились. Обновите страницу и повторите действие.',
				ok: false
			}, 409);
		}

		if (error instanceof OperationDeletedError) {
			return context.json({
				errorCode: 'invalid-state',
				message: 'Удалённую операцию сначала нужно восстановить.',
				ok: false
			}, 409);
		}

		if (error instanceof OperationTransferLinkedError) {
			return context.json({
				errorCode: 'invalid-state',
				message: 'Операция относится к переводу — измените или удалите перевод целиком.',
				ok: false
			}, 409);
		}

		if (error instanceof OperationNotFoundError) {
			return context.json({
				errorCode: 'not-found',
				message: 'Операция не найдена.',
				ok: false
			}, 404);
		}

		if (error instanceof OperationAccountUnavailableError) {
			return context.json({
				errorCode: 'reference-unavailable',
				fieldErrors: { accountId: 'Счёт недоступен.' },
				message: 'Выбранный счёт недоступен.',
				ok: false
			}, 409);
		}

		if (error instanceof OperationConversionAmountError || error instanceof ExchangeRateNotFoundError) {
			return context.json({
				errorCode: 'rate-unavailable',
				message: 'Не удалось подобрать исторический курс операции.',
				ok: false
			}, 409);
		}

		if (error instanceof HouseholdAccessRequiredError) {
			return context.json({
				errorCode: 'forbidden',
				message: 'Недостаточно прав для работы с операциями.',
				ok: false
			}, 403);
		}

		throw error;
	}
}
