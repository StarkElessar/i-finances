import type { APIEvent } from '@solidjs/start/server';

/**
 * Creates one-time WebAuthn registration options for the current user.
 */
export async function POST(event: APIEvent): Promise<Response> {
    const { handleBeginPasskeyRegistrationRequest } = await import('~/server/auth/passkey/passkey-registration-api');

    return handleBeginPasskeyRegistrationRequest(event.request);
}
