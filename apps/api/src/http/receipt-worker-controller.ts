import {
	assertReceiptWorkerApiKey,
	ReceiptImportNotFoundError,
	type ReceiptImportService,
	ReceiptImportStateError,
	ReceiptJobLeaseError,
	ReceiptWorkerAuthenticationError,
	ReceiptWorkerConfigurationError,
	ReceiptWorkerResultError
} from '@/modules/receipt-import';

import {
	completeReceiptJobInputSchema,
	failReceiptJobInputSchema,
	heartbeatReceiptJobInputSchema,
	receiptHeartbeatResponseSchema,
	receiptWorkerLeaseResponseSchema,
	receiptWorkerResultResponseSchema,
	workerIdentitySchema
} from '@i-finances/contracts';
import type { Context } from 'hono';

import { createReceiptImageResponse } from './receipt-import-controller';
import type { ApiEnvironment } from './types';

export class ReceiptWorkerHttpController {
	public constructor(private readonly receiptImportService: ReceiptImportService) {}

	public lease() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				this.authenticate(context);
				const input = workerIdentitySchema.parse(await this.readBody(context));
				const job = await this.receiptImportService.leaseNextJob(input.workerId);

				return context.json(receiptWorkerLeaseResponseSchema.parse({ job: job ?? null, ok: true }), 200);
			}
			catch (error: unknown) {
				return this.failure(context, error);
			}
		};
	}

	public heartbeat() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				this.authenticate(context);
				const input = heartbeatReceiptJobInputSchema.parse(await this.readBody(context));
				const leaseExpiresAt = await this.receiptImportService.heartbeatJob(
					context.req.param('id') ?? '',
					input.leaseToken
				);

				return context.json(receiptHeartbeatResponseSchema.parse({ leaseExpiresAt, ok: true }), 200);
			}
			catch (error: unknown) {
				return this.failure(context, error);
			}
		};
	}

	public complete() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				this.authenticate(context);
				const input = completeReceiptJobInputSchema.parse(await this.readBody(context));
				const receiptImport = await this.receiptImportService.completeJob(context.req.param('id') ?? '', input);

				return context.json(receiptWorkerResultResponseSchema.parse({
					ok: true,
					receiptImportId: receiptImport.id,
					status: receiptImport.status
				}), 200);
			}
			catch (error: unknown) {
				return this.failure(context, error);
			}
		};
	}

	public fail() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				this.authenticate(context);
				const input = failReceiptJobInputSchema.parse(await this.readBody(context));
				const receiptImport = await this.receiptImportService.failJob(context.req.param('id') ?? '', input);

				return context.json(receiptWorkerResultResponseSchema.parse({
					ok: true,
					receiptImportId: receiptImport.id,
					status: receiptImport.status
				}), 200);
			}
			catch (error: unknown) {
				return this.failure(context, error);
			}
		};
	}

	public image() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				this.authenticate(context);
				const image = await this.receiptImportService.readImageForWorker(
					context.req.param('id') ?? '',
					context.req.header('x-receipt-lease-token') ?? ''
				);

				return createReceiptImageResponse(image);
			}
			catch (error: unknown) {
				return this.failure(context, error);
			}
		};
	}

	private authenticate(context: Context<ApiEnvironment>): void {
		assertReceiptWorkerApiKey(context.req.raw);
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private failure(context: Context<ApiEnvironment>, error: unknown): Response {
		if (error instanceof ReceiptWorkerAuthenticationError) {
			return context.json({ message: 'Требуется авторизация worker.', ok: false }, 401);
		}

		if (error instanceof ReceiptWorkerConfigurationError) {
			return context.json({ message: 'Интеграция worker ещё не настроена.', ok: false }, 503);
		}

		if (error instanceof ReceiptJobLeaseError) {
			return context.json({ message: 'Lease задания недействителен.', ok: false }, 409);
		}

		if (error instanceof ReceiptImportNotFoundError) {
			return context.json({ message: 'Чек не найден.', ok: false }, 404);
		}

		if (error instanceof ReceiptImportStateError || error instanceof ReceiptWorkerResultError) {
			return context.json({ message: error.message, ok: false }, 422);
		}

		if (error instanceof Error && error.name === 'ZodError') {
			return context.json({ message: 'Некорректные данные worker.', ok: false }, 422);
		}

		throw error;
	}
}
