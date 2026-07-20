import type { RegistrationResponseJSON } from '@simplewebauthn/server';

import { assertSameOriginMutation, InvalidMutationOriginError } from '~/server/auth/csrf/origin-guard';
import { passkeyRegistrationVerificationInputSchema } from '~/server/auth/passkey/passkey-registration.contract';
import {
    beginPasskeyRegistration,
    finishPasskeyRegistration
} from '~/server/auth/passkey/passkey-service';
import { AuthenticationRequiredError, requireUser } from '~/server/auth/require-user';

type PasskeyRegistrationMetadata = {
    ipAddress?: string;
    requestOrigin: string;
    userAgent?: string;
};

/**
 * Sends a serializable JSON response.
 */
function createJsonResponse(body: unknown, statusCode = 200): Response {
    return new Response(JSON.stringify(body), {
        status: statusCode,
        headers: {
            'content-type': 'application/json; charset=utf-8'
        }
    });
}

/**
 * Reads JSON without letting malformed input escape as a 500.
 */
async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    }
    catch {
        return undefined;
    }
}

/**
 * Maps protected passkey API errors to JSON responses.
 */
function createProtectedErrorResponse(error: unknown): Response | undefined {
    if (error instanceof InvalidMutationOriginError) {
        return createJsonResponse({ ok: false, message: 'Invalid origin.' }, error.statusCode);
    }

    if (error instanceof AuthenticationRequiredError) {
        return createJsonResponse({ ok: false, message: 'Authentication required.' }, error.statusCode);
    }

    return undefined;
}

/**
 * Handles passkey enrollment options creation for authenticated users.
 */
export async function handleBeginPasskeyRegistrationRequest(request: Request): Promise<Response> {
    try {
        assertSameOriginMutation(request);

        return createJsonResponse(await beginPasskeyRegistration(await requireUser()));
    }
    catch (error: unknown) {
        const response = createProtectedErrorResponse(error);

        if (response) {
            return response;
        }

        throw error;
    }
}

/**
 * Handles passkey enrollment verification for authenticated users.
 */
export async function handleFinishPasskeyRegistrationRequest(
    request: Request,
    metadata: PasskeyRegistrationMetadata
): Promise<Response> {
    try {
        assertSameOriginMutation(request);

        const session = await requireUser();
        const parsedInput = passkeyRegistrationVerificationInputSchema.safeParse(await readJson(request));

        if (!parsedInput.success) {
            return createJsonResponse({ ok: false, message: 'Invalid registration response.' }, 400);
        }

        const result = await finishPasskeyRegistration({
            response: parsedInput.data.response as RegistrationResponseJSON,
            deviceName: parsedInput.data.deviceName,
            metadata,
            session
        });

        return createJsonResponse(result, result.ok ? 200 : 400);
    }
    catch (error: unknown) {
        const response = createProtectedErrorResponse(error);

        if (response) {
            return response;
        }

        throw error;
    }
}
