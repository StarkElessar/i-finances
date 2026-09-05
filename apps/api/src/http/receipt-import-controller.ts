import type { AuthConfig, AuthenticatedSession } from '@/modules/auth';
import {
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '@/modules/household';
import type { ReceiptImage } from '@/modules/receipt-import';
import {
	ReceiptImageValidationError,
	ReceiptImportNotFoundError,
	type ReceiptImportService,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError,
	ReceiptJobLeaseError,
	ReceiptWorkerResultError
} from '@/modules/receipt-import';

import type { receiptImportSchema } from '@i-finances/contracts';
import {
	approveReceiptInputSchema,
	createdReceiptImportResponseSchema,
	receiptImportCollectionSchema,
	receiptImportCommandResultSchema,
	requestReceiptRevisionInputSchema,
	updateReceiptReviewInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class ReceiptImportHttpController {
	public constructor(
		private readonly receiptImportService: ReceiptImportService,
		private readonly sessionResolver: RequestSessionResolver,
		private readonly config: AuthConfig
	) {}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			try {
				return context.json(
					receiptImportCollectionSchema.parse(await this.receiptImportService.list(session.user.id)),
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
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.forbidden(context);
			}

			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			try {
				const formData = await context.req.raw.formData();
				const image = formData.get('image');

				if (!(image instanceof File)) {
					return this.invalidInput(context, 'Выберите фотографию чека.');
				}

				return context.json(
					createdReceiptImportResponseSchema.parse({
						ok: true,
						receiptImport: await this.receiptImportService.createFromImage(
							session.user.id,
							{
								bytes: new Uint8Array(await image.arrayBuffer()),
								contentType: image.type,
								originalName: image.name
							}
						)
					}),
					201
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public requestRevision() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeCommand(
				context,
				requestReceiptRevisionInputSchema,
				(input, userId) => this.receiptImportService.requestRevision(userId, input)
			);
		};
	}

	public updateReview() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeCommand(
				context,
				updateReceiptReviewInputSchema,
				(input, userId) => this.receiptImportService.updateReview(userId, input)
			);
		};
	}

	public approve() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.executeCommand(
				context,
				approveReceiptInputSchema,
				(input, userId) => this.receiptImportService.approve(userId, input)
			);
		};
	}

	public image() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			try {
				const image = await this.receiptImportService.readImageForUser(
					session.user.id,
					context.req.param('id') ?? ''
				);

				return createReceiptImageResponse(image);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	private async executeCommand<TInput>(
		context: Context<ApiEnvironment>,
		schema: z.ZodType<TInput>,
		command: (input: TInput, userId: string) => Promise<z.infer<typeof receiptImportSchema>>
	): Promise<Response> {
		const input = await this.readBody(context);
		const parsedInput = schema.safeParse(this.withPathId(context, input));

		if (!parsedInput.success) {
			return this.invalidInput(context, 'Проверьте данные операции с чеком.', parsedInput.error);
		}

		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return this.forbidden(context);
		}

		const session = await this.requireSession(context);

		if (session === undefined) {
			return this.unauthenticated(context);
		}

		try {
			return context.json(receiptImportCommandResultSchema.parse({
				ok: true,
				receiptImport: await command(parsedInput.data, session.user.id)
			}), 200);
		}
		catch (error: unknown) {
			return this.domainFailure(context, error);
		}
	}

	private async requireSession(context: Context<ApiEnvironment>): Promise<AuthenticatedSession | undefined> {
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

		return { ...(body as Record<string, unknown>), id: context.req.param('id') };
	}

	private invalidInput(
		context: Context<ApiEnvironment>,
		message: string,
		error?: z.ZodError
	): Response {
		const fieldErrors: Record<string, string> = {};

		error?.issues.forEach((issue) => {
			const field = issue.path[0];

			if (typeof field === 'string') {
				fieldErrors[field] = issue.message;
			}
		});

		return context.json({
			errorCode: 'invalid-input',
			fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
			message,
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

	private forbidden(context: Context<ApiEnvironment>): Response {
		return context.json({
			errorCode: 'forbidden',
			message: 'Запрос отправлен с недопустимого адреса.',
			ok: false
		}, 403);
	}

	private domainFailure(context: Context<ApiEnvironment>, error: unknown): Response {
		if (error instanceof ReceiptImportVersionConflictError || error instanceof ReceiptJobLeaseError) {
			return context.json({
				errorCode: 'conflict',
				message: 'Состояние чека изменилось. Обновите данные и повторите действие.',
				ok: false
			}, 409);
		}

		if (error instanceof ReceiptImportNotFoundError) {
			return context.json({
				errorCode: 'not-found',
				message: 'Чек не найден.',
				ok: false
			}, 404);
		}

		if (error instanceof ReceiptImportStateError || error instanceof ReceiptWorkerResultError) {
			return context.json({
				errorCode: 'invalid-state',
				message: error.message,
				ok: false
			}, 409);
		}

		if (error instanceof ReceiptImageValidationError) {
			return context.json({
				errorCode: 'invalid-input',
				message: error.message,
				ok: false
			}, 422);
		}

		if (error instanceof HouseholdAccessRequiredError || error instanceof HouseholdSelectionRequiredError) {
			return context.json({
				errorCode: 'forbidden',
				message: 'Недостаточно прав для работы с чеками.',
				ok: false
			}, 403);
		}

		throw error;
	}
}

export function createReceiptImageResponse(image: ReceiptImage): Response {
	const safeName = image.originalName.replaceAll(/["\\\r\n]/g, '_');

	return new Response(image.bytes as BodyInit, {
		headers: {
			'Cache-Control': 'private, no-store',
			'Content-Disposition': `inline; filename="${safeName}"`,
			'Content-Length': String(image.sizeBytes),
			'Content-SHA256': image.contentSha256,
			'Content-Type': image.contentType,
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
