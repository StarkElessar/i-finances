import {
	passkeyAuthenticationOptionsSchema,
	type PasskeyRegistrationErrorCode,
	passkeyRegistrationErrorMessageByCode,
	passkeyRegistrationOptionsSchema,
	type PasskeyRegistrationResult,
	passkeyRegistrationResultSchema,
	passkeyRegistrationVerificationInputSchema,
	type PasskeySignInErrorCode,
	passkeySignInErrorMessageByCode,
	type PasskeySignInResult,
	passkeySignInResultSchema,
	passkeySignInVerificationInputSchema
} from '@i-finances/contracts';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Context } from 'hono';

import {
	type AuthConfig,
	getAuthConfig,
	type PasskeyRequestMetadata,
	type WebAuthnService
} from '../modules/auth';

import { isSameOriginMutation } from './mutation-origin';
import { createSessionCookie } from './session-cookie';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

type PasskeyFailureStatus = 400 | 401 | 403 | 500;

/**
 * Adapts the WebAuthn application service to the four browser-facing routes.
 */
export class PasskeyHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly service: WebAuthnService,
		private readonly sessionResolver: RequestSessionResolver,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public signInOptions() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.signInFailure(context, 'invalid-origin', 403);
			}

			const options = await this.service.beginAuthentication();

			return context.json(passkeyAuthenticationOptionsSchema.parse(options), 200);
		};
	}

	public signInVerification() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.signInFailure(context, 'invalid-origin', 403);
			}

			const parsedInput = passkeySignInVerificationInputSchema.safeParse(await this.readBody(context));

			if (!parsedInput.success) {
				return this.signInFailure(context, 'invalid-input', 400);
			}

			const outcome = await this.service.finishAuthentication({
				metadata: this.createMetadata(context.req.raw),
				response: parsedInput.data.response as AuthenticationResponseJSON,
				returnTo: parsedInput.data.returnTo
			});

			if (!outcome.ok) {
				return this.signInFailure(context, outcome.errorCode, this.getSignInFailureStatus(outcome.errorCode));
			}

			context.header(
				'set-cookie',
				createSessionCookie(this.config, outcome.session.token, outcome.session.expiresAt)
			);

			return context.json<PasskeySignInResult>(passkeySignInResultSchema.parse({
				ok: true,
				redirectTo: outcome.redirectTo
			}), 200);
		};
	}

	public registrationOptions() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.registrationFailure(context, 'invalid-origin', 403);
			}

			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return this.registrationFailure(context, 'authentication-required', 401);
			}

			const options = await this.service.beginRegistration(session);

			return context.json(passkeyRegistrationOptionsSchema.parse(options), 200);
		};
	}

	public registrationVerification() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.registrationFailure(context, 'invalid-origin', 403);
			}

			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return this.registrationFailure(context, 'authentication-required', 401);
			}

			const parsedInput = passkeyRegistrationVerificationInputSchema.safeParse(await this.readBody(context));

			if (!parsedInput.success) {
				return this.registrationFailure(context, 'invalid-input', 400);
			}

			const result = await this.service.finishRegistration({
				deviceName: parsedInput.data.deviceName,
				metadata: this.createMetadata(context.req.raw),
				response: parsedInput.data.response as RegistrationResponseJSON,
				session
			});

			return context.json<PasskeyRegistrationResult>(
				passkeyRegistrationResultSchema.parse(result),
				result.ok ? 200 : 400
			);
		};
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private createMetadata(request: Request): PasskeyRequestMetadata {
		const forwardedFor = request.headers.get('x-forwarded-for');

		return {
			ipAddress: forwardedFor?.split(',')[0]?.trim(),
			requestOrigin: new URL(request.url).origin,
			userAgent: request.headers.get('user-agent') ?? undefined
		};
	}

	private getSignInFailureStatus(errorCode: PasskeySignInErrorCode): 400 | 401 | 403 {
		if (errorCode === 'invalid-origin') {
			return 403;
		}

		if (errorCode === 'invalid-credentials') {
			return 401;
		}

		return 400;
	}

	private registrationFailure(
		context: Context<ApiEnvironment>,
		errorCode: PasskeyRegistrationErrorCode,
		status: PasskeyFailureStatus
	): Response {
		return context.json<PasskeyRegistrationResult>({
			errorCode,
			message: passkeyRegistrationErrorMessageByCode[errorCode],
			ok: false
		}, status);
	}

	private signInFailure(
		context: Context<ApiEnvironment>,
		errorCode: PasskeySignInErrorCode,
		status: PasskeyFailureStatus
	): Response {
		return context.json<PasskeySignInResult>({
			errorCode,
			message: passkeySignInErrorMessageByCode[errorCode],
			ok: false
		}, status);
	}
}
