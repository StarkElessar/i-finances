import type { APIEvent } from '@solidjs/start/server';

/**
 * Handles password fallback sign-in form submissions.
 */
export async function POST(event: APIEvent): Promise<Response> {
	const { handlePasswordSignInRequest } = await import('~/views/sign-in/api/sign-in-with-password.server');

	return handlePasswordSignInRequest(
		event.request,
		{
			ipAddress: event.clientAddress,
			userAgent: event.request.headers.get('user-agent') ?? undefined
		}
	);
}
