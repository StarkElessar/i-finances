import type { AuthenticatedSession } from '@/modules/auth';
import type { CategoryService } from '@/modules/category';
import {
	CategoryNameConflictError,
	CategoryNotFoundError,
	CategoryVersionConflictError
} from '@/modules/category';
import {
	DEFAULT_HOUSEHOLD_ID,
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '@/modules/household';

import {
	type CategoryCommandResult,
	categoryListInputSchema,
	changeCategoryArchiveStateInputSchema,
	type CreateCategoryInput,
	createCategoryInputSchema,
	type PersistedCategory,
	type UpdateCategoryInput,
	updateCategoryInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

const PUBLIC_JSON_HEADERS = {
	'access-control-allow-origin': '*',
	'cache-control': 'no-store',
	'content-type': 'application/json; charset=utf-8'
} as const;

export class CategoryHttpController {
	public constructor(
		private readonly categoryService: CategoryService,
		private readonly sessionResolver: RequestSessionResolver
	) {}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = categoryListInputSchema.safeParse({
				status: context.req.query('status')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.categoryService.list(session.user.id, parsedInput.data.status),
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
				createCategoryInputSchema,
				(input: CreateCategoryInput, userId: string) => this.categoryService.create(userId, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const body = await this.readBody(context);
			const input = this.withPathId(context, body);

			return this.executeMutation(
				context,
				input,
				updateCategoryInputSchema,
				(input: UpdateCategoryInput, userId: string) => this.categoryService.update(userId, input)
			);
		};
	}

	public archive() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.categoryService.archive(userId, input));
		};
	}

	public restore() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.categoryService.restore(userId, input));
		};
	}

	public publicList() {
		return async (): Promise<Response> => {
			const categories = await this.categoryService.listPublic(DEFAULT_HOUSEHOLD_ID);

			return new Response(JSON.stringify(categories), {
				headers: PUBLIC_JSON_HEADERS,
				status: 200
			});
		};
	}

	public publicOptions() {
		return (): Response => new Response(null, {
			headers: {
				'access-control-allow-headers': 'accept, content-type',
				'access-control-allow-methods': 'GET, OPTIONS',
				'access-control-allow-origin': '*',
				'access-control-max-age': '86400'
			},
			status: 204
		});
	}

	private async executeArchiveMutation(
		context: Context<ApiEnvironment>,
		command: (
			userId: string,
			input: z.infer<typeof changeCategoryArchiveStateInputSchema>
		) => Promise<PersistedCategory>
	): Promise<Response> {
		const body = await this.readBody(context);
		const input = this.withPathId(context, body);

		return this.executeMutation(
			context,
			input,
			changeCategoryArchiveStateInputSchema,
			(commandInput, userId) => command(userId, commandInput)
		);
	}

	private async executeMutation<TInput>(
		context: Context<ApiEnvironment>,
		input: unknown,
		schema: z.ZodType<TInput>,
		command: (input: TInput, userId: string) => Promise<PersistedCategory>
	): Promise<Response> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return this.invalidInput(context, parsedInput.error);
		}

		if (!isSameOriginMutation(context.req.raw)) {
			return context.json<CategoryCommandResult>({
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
				category: await command(parsedInput.data, session.user.id),
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
		const session = await this.sessionResolver.resolve(context.req.raw);

		return session ?? undefined;
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

		return context.json<CategoryCommandResult>({
			errorCode: 'invalid-input',
			fieldErrors,
			message: 'Проверьте поля категории.',
			ok: false
		}, 400);
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return context.json<CategoryCommandResult>({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		}, 401);
	}

	private domainFailure(
		context: Context<ApiEnvironment>,
		error: unknown
	): Response {
		if (error instanceof CategoryNameConflictError) {
			return context.json<CategoryCommandResult>({
				errorCode: 'conflict',
				fieldErrors: {
					name: 'Категория с таким названием уже существует.'
				},
				message: 'Используйте другое название категории.',
				ok: false
			}, 409);
		}

		if (error instanceof CategoryVersionConflictError || error instanceof HouseholdSelectionRequiredError) {
			return context.json<CategoryCommandResult>({
				errorCode: 'conflict',
				message: 'Данные изменились. Обновите категории и повторите действие.',
				ok: false
			}, 409);
		}

		if (error instanceof CategoryNotFoundError) {
			return context.json<CategoryCommandResult>({
				errorCode: 'not-found',
				message: 'Категория не найдена.',
				ok: false
			}, 404);
		}

		if (error instanceof HouseholdAccessRequiredError) {
			return context.json<CategoryCommandResult>({
				errorCode: 'forbidden',
				message: 'Недостаточно прав для изменения категорий.',
				ok: false
			}, 403);
		}

		throw error;
	}
}
