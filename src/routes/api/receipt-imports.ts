import type { APIEvent } from '@solidjs/start/server';

import { assertSameOriginMutation } from '~/server/auth/csrf/origin-guard';
import { getSessionFromRequest } from '~/server/auth/require-user';
import { createReceiptHttpFailure } from '~/server/receipt-import/receipt-import-http';
import { receiptImportService } from '~/server/receipt-import/receipt-import-service-instance';

/**
 * Accepts one authenticated receipt photo and creates a queued import.
 */
export async function POST(event: APIEvent): Promise<Response> {
    try {
        assertSameOriginMutation(event.request);

        const session = await getSessionFromRequest(event.request);

        if (session === null) {
            return Response.json({
                message: 'Требуется войти в приложение.',
                ok: false
            }, { status: 401 });
        }

        const formData = await event.request.formData();
        const image = formData.get('image');

        if (!(image instanceof File)) {
            return Response.json({
                message: 'Выберите фотографию чека.',
                ok: false
            }, { status: 422 });
        }

        const receiptImport = await receiptImportService.createFromImage(
            session.user.id,
            {
                bytes: new Uint8Array(await image.arrayBuffer()),
                contentType: image.type,
                originalName: image.name
            }
        );

        return Response.json({
            ok: true,
            receiptImport
        }, { status: 201 });
    }
    catch (error: unknown) {
        const failure = createReceiptHttpFailure(error);

        if (failure !== undefined) {
            return failure;
        }

        throw error;
    }
}
