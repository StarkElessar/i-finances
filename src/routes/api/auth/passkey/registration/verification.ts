import type { APIEvent } from '@solidjs/start/server';

/**
 * Verifies and stores a WebAuthn registration response for the current user.
 */
export async function POST(event: APIEvent): Promise<Response> {
	const { handleFinishPasskeyRegistrationRequest } = await import('~/server/auth/passkey/passkey-registration-api');

	return handleFinishPasskeyRegistrationRequest(event.request, {
		ipAddress: event.clientAddress,
		requestOrigin: new URL(event.request.url).origin,
		userAgent: event.request.headers.get('user-agent') ?? undefined
	});
}
