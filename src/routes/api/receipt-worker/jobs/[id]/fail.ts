import type { APIEvent } from '@solidjs/start/server';

import { failReceiptJobInputSchema } from '~/entities/receipt-import';
import { createReceiptHttpFailure } from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';
import { assertReceiptWorkerApiKey } from '~/server/receipt-import/receipt-worker-auth';

/**
 * Stores a safe worker error for a leased receipt job.
 */
export async function POST(event: APIEvent): Promise<Response> {
	try {
		assertReceiptWorkerApiKey(event.request);

		const input = failReceiptJobInputSchema.parse(
			await event.request.json()
		);
		const receiptImport = await receiptImportService.failJob(
			event.params.id,
			input
		);

		return Response.json({
			ok: true,
			receiptImportId: receiptImport.id,
			status: receiptImport.status
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
