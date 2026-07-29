import type { APIEvent } from '@solidjs/start/server';

import { completeReceiptJobInputSchema } from '~/entities/receipt-import';
import { createReceiptHttpFailure } from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';
import { assertReceiptWorkerApiKey } from '~/server/receipt-import/receipt-worker-auth';

/**
 * Accepts the fully structured and categorized result of a leased job.
 */
export async function POST(event: APIEvent): Promise<Response> {
    try {
        assertReceiptWorkerApiKey(event.request);

        const input = completeReceiptJobInputSchema.parse(
            await event.request.json()
        );
        const receiptImport = await receiptImportService.completeJob(
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
