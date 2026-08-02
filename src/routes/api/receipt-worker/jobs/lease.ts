import { workerIdentitySchema } from '~/entities/receipt-import';

import { createReceiptHttpFailure } from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';
import { assertReceiptWorkerApiKey } from '~/server/receipt-import/receipt-worker-auth';

import type { APIEvent } from '@solidjs/start/server';

/**
 * Leases the oldest queued receipt job to an authenticated worker.
 */
export async function POST(event: APIEvent): Promise<Response> {
	try {
		assertReceiptWorkerApiKey(event.request);

		const input = workerIdentitySchema.parse(await event.request.json());
		const job = await receiptImportService.leaseNextJob(input.workerId);

		return job === undefined
			? new Response(null, { status: 204 })
			: Response.json(job);
	}
	catch (error: unknown) {
		const failure = createReceiptHttpFailure(error);

		if (failure !== undefined) {
			return failure;
		}

		throw error;
	}
}
