import type { APIEvent } from '@solidjs/start/server';

/**
 * Creates one-time WebAuthn authentication options.
 */
export async function POST(event: APIEvent): Promise<Response> {
    const { handleBeginPasskeySignInRequest } = await import('~/views/sign-in/api/sign-in-with-passkey.server');

    return handleBeginPasskeySignInRequest(event.request);
}
