import {
	type AccountCommandResult,
	accountListInputSchema,
	changeAccountArchiveStateInputSchema,
	type CreateAccountInput,
	createAccountInputSchema,
	type PersistedAccount,
	type UpdateAccountInput,
	updateAccountInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import type { AccountService } from '../modules/account';
import {
	AccountConversionAmountError,
	AccountCurrencyCorrectionConflictError,
	AccountCurrencyCorrectionRequiredError,
	AccountNotFoundError,
	AccountVersionConflictError
} from '../modules/account';
import type { AuthenticatedSession } from '../modules/auth';
import type { AuthConfig } from '../modules/auth';
import { getAuthConfig } from '../modules/auth';
import { ExchangeRateNotFoundError } from '../modules/exchange-rate';
import {
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '../modules/household';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class AccountHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly accountService: AccountService,
		private readonly sessionResolver: RequestSessionResolver,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = accountListInputSchema.safeParse({
				includeArchived: context.req.query('includeArchived')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.accountService.list(session.user.id, parsedInput.data.includeArchived),
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
				createAccountInputSchema,
				(input: CreateAccountInput, userId: string) => this.accountService.create(userId, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const input = this.withPathId(context, await this.readBody(context));

			return this.executeMutation(
				context,
				input,
				updateAccountInputSchema,
				(accountInput: UpdateAccountInput, userId: string) => this.accountService.update(userId, accountInput)
			);
		};
	}

	public archive() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.accountService.archive(userId, input));
		};
	}

	public restore() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.accountService.restore(userId, input));
		};
	}

	private async executeArchiveMutation(
		context: Context<ApiEnvironment>,
		command: (
			userId: string,
			input: z.infer<typeof changeAccountArchiveStateInputSchema>
		) => Promise<PersistedAccount>
	): Promise<Response> {
		return this.executeMutation(
			context,
			this.withPathId(context, await this.readBody(context)),
			changeAccountArchiveStateInputSchema,
			(commandInput, userId) => command(userId, commandInput)
		);
	}

	private async executeMutation<TInput>(
		context: Context<ApiEnvironment>,
		input: unknown,
		schema: z.ZodType<TInput>,
		command: (input: TInput, userId: string) => Promise<PersistedAccount>
	): Promise<Response> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return this.invalidInput(context, parsedInput.error);
		}

		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return context.json<AccountCommandResult>({
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
			return context.json<AccountCommandResult>({
				account: await command(parsedInput.data, session.user.id),
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

		return context.json<AccountCommandResult>({
			errorCode: 'invalid-input',
			fieldErrors,
			message: 'Проверьте поля счёта.',
			ok: false
		}, 400);
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return context.json<AccountCommandResult>({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		}, 401);
	}

	private domainFailure(
		context: Context<ApiEnvironment>,
		error: unknown
	): Response {
		if (error instanceof AccountCurrencyCorrectionRequiredError) {
			return context.json<AccountCommandResult>({
				errorCode: 'confirmation-required',
				message: 'Смена валюты перепишет исторические суммы операций. Подтвердите действие.',
				ok: false
			}, 409);
		}

		if (
			error instanceof AccountVersionConflictError
			|| error instanceof AccountCurrencyCorrectionConflictError
			|| error instanceof HouseholdSelectionRequiredError
		) {
			return context.json<AccountCommandResult>({
				errorCode: 'conflict',
				message: 'Данные счёта изменились. Обновите счета и повторите действие.',
				ok: false
			}, 409);
		}

		if (error instanceof AccountNotFoundError) {
			return context.json<AccountCommandResult>({
				errorCode: 'not-found',
				message: 'Счёт не найден.',
				ok: false
			}, 404);
		}

		if (error instanceof AccountConversionAmountError || error instanceof ExchangeRateNotFoundError) {
			return context.json<AccountCommandResult>({
				errorCode: 'rate-unavailable',
				message: 'Не удалось подобрать исторический курс для операций счёта.',
				ok: false
			}, 409);
		}

		if (error instanceof HouseholdAccessRequiredError) {
			return context.json<AccountCommandResult>({
				errorCode: 'forbidden',
				message: 'Недостаточно прав для изменения счетов.',
				ok: false
			}, 403);
		}

		throw error;
	}
}
