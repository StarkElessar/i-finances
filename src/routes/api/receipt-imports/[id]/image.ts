import { getSessionFromRequest } from '~/server/auth/require-user';
import {
	createReceiptHttpFailure,
	createReceiptImageResponse
} from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';

import type { APIEvent } from '@solidjs/start/server';

/**
 * Streams a private receipt image to an authenticated household member.
 */
export async function GET(event: APIEvent): Promise<Response> {
	try {
		const session = await getSessionFromRequest(event.request);

		if (session === null) {
			return Response.json({
				message: 'Требуется войти в приложение.',
				ok: false
			}, { status: 401 });
		}

		const image = await receiptImportService.readImageForUser(
			session.user.id,
			event.params.id
		);

		return createReceiptImageResponse(image);
	}
	catch (error: unknown) {
		const failure = createReceiptHttpFailure(error);

		if (failure !== undefined) {
			return failure;
		}

		throw error;
	}
}
