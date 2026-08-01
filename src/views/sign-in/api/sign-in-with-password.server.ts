import { z } from 'zod';

import { assertSameOriginMutation, InvalidMutationOriginError } from '~/server/auth/csrf/origin-guard';
import { normalizeUsername } from '~/server/auth/password/normalize-username';
import { verifyPassword } from '~/server/auth/password/password-service';
import { findPasswordAuthUserByUsername } from '~/server/auth/password/password-user-repository';
import {
	checkPasswordSignInRateLimit,
	clearPasswordSignInRateLimit,
	recordPasswordSignInFailure
} from '~/server/auth/rate-limit/login-rate-limit';
import { writeSessionCookie } from '~/server/auth/session/auth-cookie';
import { createSession } from '~/server/auth/session/session-service';
import { validateReturnPath } from '~/server/auth/validate-return-path';
import type {
	PasswordSignInErrorCode,
	PasswordSignInInput,
	PasswordSignInResult
} from '~/views/sign-in/api/password-sign-in.contract';
import {
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema
} from '~/views/sign-in/api/password-sign-in.contract';

const SEE_OTHER_STATUS_CODE = 303;

type PasswordSignInMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

type PasswordSignInSuccessResult = Extract<PasswordSignInResult, { ok: true }> & {
	statusCode: number;
};

type PasswordSignInFailureResult = Extract<PasswordSignInResult, { ok: false }> & {
	statusCode: number;
};

type PasswordSignInServerResult = PasswordSignInSuccessResult | PasswordSignInFailureResult;

/**
 * Extracts one string field from a native form payload.
 */
function readFormString(formData: FormData, name: keyof PasswordSignInInput): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

/**
 * Converts Zod field errors to the serializable shape consumed by TextField.
 */
function createFieldErrors(input: Record<string, string[] | undefined>): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	for (const [field, messages] of Object.entries(input)) {
		const firstMessage = messages?.[0];

		if (firstMessage) {
			fieldErrors[field] = firstMessage;
		}
	}

	return fieldErrors;
}

/**
 * Builds a typed login input from submitted form data.
 */
function createPasswordSignInInput(formData: FormData): PasswordSignInInput {
	return {
		username: readFormString(formData, 'username'),
		password: readFormString(formData, 'password'),
		returnTo: readFormString(formData, 'returnTo')
	};
}

/**
 * Creates a failed password sign-in result with an HTTP status.
 */
function createFailureResult(
	errorCode: PasswordSignInErrorCode,
	statusCode: number,
	fieldErrors?: Record<string, string>
): PasswordSignInFailureResult {
	return {
		ok: false,
		errorCode,
		message: passwordSignInErrorMessageByCode[errorCode],
		fieldErrors,
		statusCode
	};
}

/**
 * Returns true when the browser asked for a JSON response.
 */
function acceptsJson(request: Request): boolean {
	return request.headers.get('accept')?.includes('application/json') ?? false;
}

/**
 * Sends a serializable JSON response.
 */
function createJsonResponse(result: PasswordSignInServerResult): Response {
	const { statusCode, ...body } = result;

	return new Response(JSON.stringify(body), {
		status: statusCode,
		headers: {
			'content-type': 'application/json; charset=utf-8'
		}
	});
}

/**
 * Redirects a native form submission back to the password panel with a generic error.
 */
function createFailureRedirect(request: Request, input: PasswordSignInInput, errorCode: PasswordSignInErrorCode): Response {
	const url = new URL('/sign-in', request.url);
	const returnTo = validateReturnPath(input.returnTo);

	url.searchParams.set('method', 'password');
	url.searchParams.set('error', errorCode);

	if (returnTo !== '/') {
		url.searchParams.set('from', returnTo);
	}

	return new Response(null, {
		status: SEE_OTHER_STATUS_CODE,
		headers: {
			location: url.toString()
		}
	});
}

/**
 * Redirects after a successful native form submission.
 */
function createSuccessRedirect(request: Request, redirectTo: string): Response {
	return new Response(null, {
		status: SEE_OTHER_STATUS_CODE,
		headers: {
			location: new URL(redirectTo, request.url).toString()
		}
	});
}

/**
 * Verifies username/password credentials and creates a browser session.
 */
export async function signInWithPassword(
	input: PasswordSignInInput,
	metadata: PasswordSignInMetadata = {}
): Promise<PasswordSignInServerResult> {
	const parsedInput = passwordSignInInputSchema.safeParse(input);

	if (!parsedInput.success) {
		return createFailureResult('invalid-input', 400, createFieldErrors(z.flattenError(parsedInput.error).fieldErrors));
	}

	const username = normalizeUsername(parsedInput.data.username);
	const rateLimit = checkPasswordSignInRateLimit({
		ipAddress: metadata.ipAddress,
		username
	});

	if (!rateLimit.allowed) {
		return createFailureResult('rate-limited', 429);
	}

	const user = await findPasswordAuthUserByUsername(username);
	const isPasswordValid = user?.isActive
		? await verifyPassword(user.passwordHash, parsedInput.data.password)
		: false;

	if (!user?.isActive || !isPasswordValid) {
		recordPasswordSignInFailure({
			ipAddress: metadata.ipAddress,
			username
		});

		return createFailureResult('invalid-credentials', 401);
	}

	clearPasswordSignInRateLimit({
		ipAddress: metadata.ipAddress,
		username
	});

	const session = await createSession(user.id, metadata);
	writeSessionCookie(session.token, session.expiresAt);

	return {
		ok: true,
		redirectTo: validateReturnPath(parsedInput.data.returnTo),
		statusCode: 200
	};
}

/**
 * Handles the SolidStart route POST adapter for password sign-in.
 */
export async function handlePasswordSignInRequest(request: Request, metadata: PasswordSignInMetadata = {}): Promise<Response> {
	const formData = await request.formData();
	const input = createPasswordSignInInput(formData);

	try {
		assertSameOriginMutation(request);
	}
	catch (error: unknown) {
		if (!(error instanceof InvalidMutationOriginError)) {
			throw error;
		}

		const result = createFailureResult('invalid-origin', error.statusCode);

		return acceptsJson(request)
			? createJsonResponse(result)
			: createFailureRedirect(request, input, result.errorCode);
	}

	const result = await signInWithPassword(input, metadata);

	if (acceptsJson(request)) {
		return createJsonResponse(result);
	}

	return result.ok
		? createSuccessRedirect(request, result.redirectTo)
		: createFailureRedirect(request, input, result.errorCode);
}
