import type { APIEvent } from '@solidjs/start/server';

import {
	createReceiptHttpFailure,
	createReceiptImageResponse
} from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';
import { assertReceiptWorkerApiKey } from '~/server/receipt-import/receipt-worker-auth';

/**
 * Streams the leased receipt image bytes to the owning worker.
 */
export async function GET(event: APIEvent): Promise<Response> {
	try {
		assertReceiptWorkerApiKey(event.request);

		const leaseToken = event.request.headers.get(
			'x-receipt-lease-token'
		) ?? '';
		const image = await receiptImportService.readImageForWorker(
			event.params.id,
			leaseToken
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
