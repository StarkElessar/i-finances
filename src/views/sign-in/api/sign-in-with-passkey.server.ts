import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

import { assertSameOriginMutation, InvalidMutationOriginError } from '~/server/auth/csrf/origin-guard';
import type { PasskeySignInServerResult } from '~/server/auth/passkey/passkey-service';
import {
	beginPasskeyAuthentication,
	finishPasskeyAuthentication
} from '~/server/auth/passkey/passkey-service';
import type {
	PasskeySignInErrorCode,
	PasskeySignInResult
} from '~/views/sign-in/api/passkey-sign-in.contract';
import {
	passkeySignInErrorMessageByCode,
	passkeySignInVerificationInputSchema
} from '~/views/sign-in/api/passkey-sign-in.contract';

type PasskeySignInMetadata = {
	ipAddress?: string;
	requestOrigin: string;
	userAgent?: string;
};

/**
 * Creates a failed passkey sign-in result with an HTTP status.
 */
function createFailureResult(errorCode: PasskeySignInErrorCode, statusCode: number): PasskeySignInServerResult {
	return {
		ok: false,
		errorCode,
		message: passkeySignInErrorMessageByCode[errorCode],
		statusCode
	};
}

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
 * Sends a passkey result without leaking internal status metadata.
 */
function createResultResponse(result: PasskeySignInServerResult): Response {
	const { statusCode, ...body } = result;

	return createJsonResponse(body satisfies PasskeySignInResult, statusCode);
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
 * Handles passkey authentication options creation.
 */
export async function handleBeginPasskeySignInRequest(request: Request): Promise<Response> {
	try {
		assertSameOriginMutation(request);
	}
	catch (error: unknown) {
		if (error instanceof InvalidMutationOriginError) {
			return createResultResponse(createFailureResult('invalid-origin', error.statusCode));
		}

		throw error;
	}

	return createJsonResponse(await beginPasskeyAuthentication());
}

/**
 * Handles passkey assertion verification and session creation.
 */
export async function handleFinishPasskeySignInRequest(request: Request, metadata: PasskeySignInMetadata): Promise<Response> {
	try {
		assertSameOriginMutation(request);
	}
	catch (error: unknown) {
		if (error instanceof InvalidMutationOriginError) {
			return createResultResponse(createFailureResult('invalid-origin', error.statusCode));
		}

		throw error;
	}

	const parsedInput = passkeySignInVerificationInputSchema.safeParse(await readJson(request));

	if (!parsedInput.success) {
		return createResultResponse(createFailureResult('invalid-input', 400));
	}

	return createResultResponse(await finishPasskeyAuthentication({
		response: parsedInput.data.response as AuthenticationResponseJSON,
		returnTo: parsedInput.data.returnTo,
		metadata
	}));
}
