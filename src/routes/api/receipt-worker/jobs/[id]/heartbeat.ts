import { heartbeatReceiptJobInputSchema } from '~/entities/receipt-import';

import { createReceiptHttpFailure } from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';
import { assertReceiptWorkerApiKey } from '~/server/receipt-import/receipt-worker-auth';

import type { APIEvent } from '@solidjs/start/server';

/**
 * Extends an active receipt job lease while local models are still running.
 */
export async function POST(event: APIEvent): Promise<Response> {
	try {
		assertReceiptWorkerApiKey(event.request);

		const input = heartbeatReceiptJobInputSchema.parse(
			await event.request.json()
		);
		const leaseExpiresAt = await receiptImportService.heartbeatJob(
			event.params.id,
			input.leaseToken
		);

		return Response.json({
			leaseExpiresAt,
			ok: true
		});
	}
	catch (error: unknown) {
		const failure = createReceiptHttpFailure(error);

		if (failure !== undefined) {
			return failure;
		}

		throw error;
	}
}
