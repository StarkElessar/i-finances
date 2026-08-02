import { InvalidMutationOriginError } from '~/server/auth/csrf/origin-guard';
import {
	AuthenticationRequiredError
} from '~/server/auth/require-user';
import {
	ReceiptImageValidationError,
	ReceiptImportNotFoundError,
	ReceiptImportStateError,
	ReceiptImportVersionConflictError,
	ReceiptJobLeaseError,
	ReceiptWorkerResultError
} from '~/server/receipt-import/receipt-import-errors';
import {
	ReceiptWorkerAuthenticationError,
	ReceiptWorkerConfigurationError
} from '~/server/receipt-import/receipt-worker-auth';

import { z } from 'zod';

function jsonError(message: string, status: number): Response {
	return Response.json({
		message,
		ok: false
	}, { status });
}

/**
 * Maps known receipt HTTP failures without leaking internal error details.
 */
export function createReceiptHttpFailure(
	error: unknown
): Response | undefined {
	if (
		error instanceof AuthenticationRequiredError
		|| error instanceof ReceiptWorkerAuthenticationError
	) {
		return jsonError('Требуется авторизация.', 401);
	}

	if (error instanceof InvalidMutationOriginError) {
		return jsonError('Запрос отправлен с недопустимого адреса.', 403);
	}

	if (error instanceof ReceiptImportNotFoundError) {
		return jsonError('Чек не найден.', 404);
	}

	if (
		error instanceof ReceiptImportVersionConflictError
		|| error instanceof ReceiptJobLeaseError
	) {
		return jsonError(
			'Состояние задачи изменилось. Получите актуальные данные.',
			409
		);
	}

	if (
		error instanceof ReceiptImageValidationError
		|| error instanceof ReceiptImportStateError
		|| error instanceof ReceiptWorkerResultError
		|| error instanceof z.ZodError
	) {
		return jsonError(error.message, 422);
	}

	if (error instanceof ReceiptWorkerConfigurationError) {
		return jsonError('Интеграция Mac Mini ещё не настроена.', 503);
	}

	return undefined;
}

/**
 * Creates a private inline image response with integrity metadata.
 */
export function createReceiptImageResponse(
	image: {
		bytes: Uint8Array;
		contentSha256: string;
		contentType: string;
		originalName: string;
		sizeBytes: number;
	}
): Response {
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
