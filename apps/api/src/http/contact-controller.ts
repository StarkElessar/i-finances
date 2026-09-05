import type { AuthenticatedSession } from '@/modules/auth';
import type { ContactService } from '@/modules/contact';
import {
	ContactNameConflictError,
	ContactNotFoundError,
	ContactVersionConflictError
} from '@/modules/contact';
import {
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '@/modules/household';

import {
	changeContactArchiveStateInputSchema,
	type ContactCommandResult,
	contactListInputSchema,
	type CreateContactInput,
	createContactInputSchema,
	type PersistedContact,
	type UpdateContactInput,
	updateContactInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class ContactHttpController {
	public constructor(
		private readonly contactService: ContactService,
		private readonly sessionResolver: RequestSessionResolver
	) {}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = contactListInputSchema.safeParse({
				status: context.req.query('status')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.contactService.list(session.user.id, parsedInput.data.status),
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
				createContactInputSchema,
				(input: CreateContactInput, userId: string) => this.contactService.create(userId, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeMutation(
				context,
				this.withPathId(context, await this.readBody(context)),
				updateContactInputSchema,
				(input: UpdateContactInput, userId: string) => this.contactService.update(userId, input)
			);
		};
	}

	public archive() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.contactService.archive(userId, input));
		};
	}

	public restore() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeArchiveMutation(context, (userId, input) => this.contactService.restore(userId, input));
		};
	}

	private async executeArchiveMutation(
		context: Context<ApiEnvironment>,
		command: (
			userId: string,
			input: z.infer<typeof changeContactArchiveStateInputSchema>
		) => Promise<PersistedContact>
	): Promise<Response> {
		return this.executeMutation(
			context,
			this.withPathId(context, await this.readBody(context)),
			changeContactArchiveStateInputSchema,
			(input, userId) => command(userId, input)
		);
	}

	private async executeMutation<TInput>(
		context: Context<ApiEnvironment>,
		input: unknown,
		schema: z.ZodType<TInput>,
		command: (input: TInput, userId: string) => Promise<PersistedContact>
	): Promise<Response> {
		const parsedInput = schema.safeParse(input);

		if (!parsedInput.success) {
			return this.invalidInput(context, parsedInput.error);
		}

		if (!isSameOriginMutation(context.req.raw)) {
			return context.json<ContactCommandResult>({
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
			return context.json<ContactCommandResult>({
				contact: await command(parsedInput.data, session.user.id),
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

	private withPathId(context: Context<ApiEnvironment>, body: unknown): unknown {
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return body;
		}

		return {
			...(body as Record<string, unknown>),
			id: context.req.param('id')
		};
	}

	private invalidInput(context: Context<ApiEnvironment>, error: z.ZodError): Response {
		const fieldErrors: Record<string, string> = {};

		error.issues.forEach((issue) => {
			const field = issue.path[0];

			if (typeof field === 'string') {
				fieldErrors[field] = issue.message;
			}
		});

		return context.json<ContactCommandResult>({
			errorCode: 'invalid-input',
			fieldErrors,
			message: 'Проверьте поля контакта.',
			ok: false
		}, 400);
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return context.json<ContactCommandResult>({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		}, 401);
	}

	private domainFailure(context: Context<ApiEnvironment>, error: unknown): Response {
		if (error instanceof ContactNameConflictError) {
			return context.json<ContactCommandResult>({
				errorCode: 'conflict',
				fieldErrors: { name: 'Контакт с таким названием уже существует.' },
				message: 'Используйте другое название контакта.',
				ok: false
			}, 409);
		}

		if (error instanceof ContactVersionConflictError || error instanceof HouseholdSelectionRequiredError) {
			return context.json<ContactCommandResult>({
				errorCode: 'conflict',
				message: 'Данные изменились. Обновите контакты и повторите действие.',
				ok: false
			}, 409);
		}

		if (error instanceof ContactNotFoundError) {
			return context.json<ContactCommandResult>({
				errorCode: 'not-found',
				message: 'Контакт не найден.',
				ok: false
			}, 404);
		}

		if (error instanceof HouseholdAccessRequiredError) {
			return context.json<ContactCommandResult>({
				errorCode: 'forbidden',
				message: 'Недостаточно прав для изменения контактов.',
				ok: false
			}, 403);
		}

		throw error;
	}
}
