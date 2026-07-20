import type { APIEvent } from '@solidjs/start/server';

const SEE_OTHER_STATUS_CODE = 303;

/**
 * Revokes the current browser session and clears the auth cookie.
 */
export async function POST(event: APIEvent): Promise<Response> {
    const { assertSameOriginMutation, InvalidMutationOriginError } = await import('~/server/auth/csrf/origin-guard');
    const { readSessionCookieFromRequest, clearSessionCookie } = await import('~/server/auth/session/auth-cookie');
    const { revokeSessionToken } = await import('~/server/auth/session/session-service');

    try {
        assertSameOriginMutation(event.request);
    }
    catch (error: unknown) {
        if (error instanceof InvalidMutationOriginError) {
            return new Response(null, { status: error.statusCode });
        }

        throw error;
    }

    await revokeSessionToken(readSessionCookieFromRequest(event.request));
    clearSessionCookie();

    return new Response(null, {
        status: SEE_OTHER_STATUS_CODE,
        headers: {
            location: new URL('/sign-in', event.request.url).toString()
        }
    });
}
