import type { APIEvent } from '@solidjs/start/server';

/**
 * Verifies a WebAuthn authentication response and creates a session.
 */
export async function POST(event: APIEvent): Promise<Response> {
    const { handleFinishPasskeySignInRequest } = await import('~/views/sign-in/api/sign-in-with-passkey.server');

    return handleFinishPasskeySignInRequest(event.request, {
        ipAddress: event.clientAddress,
        requestOrigin: new URL(event.request.url).origin,
        userAgent: event.request.headers.get('user-agent') ?? undefined
    });
}
