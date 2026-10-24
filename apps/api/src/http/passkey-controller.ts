import {
	type AuthConfig,
	getAuthConfig,
	type PasskeyRequestMetadata,
	type WebAuthnService
} from '@/modules/auth';

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
import type { Context, Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { readClientIp } from './client-ip';
import { isSameOriginMutation } from './mutation-origin';
import { mutationOriginGuard } from './mutation-origin-guard';
import { createSessionCookie } from './session-cookie';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

type PasskeyFailureStatus = 400 | 401 | 403 | 413 | 500;

const SIGN_IN_BODY_LIMIT_BYTES = 16 * 1024;

const REGISTRATION_BODY_LIMIT_BYTES = 64 * 1024;

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

	public signInOriginGuard() {
		return mutationOriginGuard(this.config, (context) => this.signInFailure(context, 'invalid-origin', 403));
	}

	public signInBodyLimit() {
		return bodyLimit({
			maxSize: SIGN_IN_BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.signInFailure(context, 'payload-too-large', 413)
		});
	}

	public registrationOriginGuard() {
		return mutationOriginGuard(this.config, (context) => this.registrationFailure(context, 'invalid-origin', 403));
	}

	/** Runs before the body limit so that an anonymous client cannot make the API buffer a 64 KiB body. */
	public registrationSessionGuard() {
		return async (context: Context<ApiEnvironment>, next: Next): Promise<Response | undefined> => {
			if ((await this.sessionResolver.resolve(context.req.raw)) === null) {
				return this.registrationFailure(context, 'authentication-required', 401);
			}

			await next();

			return undefined;
		};
	}

	public registrationBodyLimit() {
		// Attestation can include a certificate chain, unlike the smaller sign-in assertion.
		return bodyLimit({
			maxSize: REGISTRATION_BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.registrationFailure(context, 'payload-too-large', 413)
		});
	}

	public signInOptions() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const options = await this.service.beginAuthentication();

			return context.json(passkeyAuthenticationOptionsSchema.parse(options), 200);
		};
	}

	public signInVerification() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const parsedInput = passkeySignInVerificationInputSchema.safeParse(await this.readBody(context));

			if (!parsedInput.success) {
				return this.signInFailure(context, 'invalid-input', 400);
			}

			const outcome = await this.service.finishAuthentication({
				metadata: this.createMetadata(context),
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
				metadata: this.createMetadata(context),
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

	private createMetadata(context: Context<ApiEnvironment>): PasskeyRequestMetadata {
		return {
			ipAddress: readClientIp(context, this.config.trustedProxyCount),
			requestOrigin: new URL(context.req.url).origin,
			userAgent: context.req.header('user-agent')
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
