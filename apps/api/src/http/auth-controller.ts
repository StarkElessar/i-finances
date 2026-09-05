import type { SessionService } from '@/modules/auth';
import type { PasswordSignInService } from '@/modules/auth';
import {
	type AuthConfig,
	getAuthConfig
} from '@/modules/auth';

import {
	type CurrentSessionResponse,
	currentSessionResponseSchema,
	passwordSignInErrorMessageByCode,
	type PasswordSignInResult,
	type PasswordSignOutResult,
	passwordSignOutResultSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';

import {
	assertSameOriginMutation,
	InvalidMutationOriginError,
	isSameOriginMutation
} from './mutation-origin';
import { createClearedSessionCookie, createSessionCookie, readSessionCookie } from './session-cookie';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

type AuthFailureStatus = 400 | 401 | 403 | 429 | 500;

export class AuthHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly passwordSignInService: PasswordSignInService,
		private readonly sessionService: SessionService,
		private readonly sessionResolver: RequestSessionResolver,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public currentSession() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.sessionResolver.resolve(context.req.raw);
			const response: CurrentSessionResponse = session === null
				? { authenticated: false }
				: {
					authenticated: true,
					user: {
						displayName: session.user.displayName,
						id: session.user.id,
						username: session.user.username
					}
				};

			return context.json(currentSessionResponseSchema.parse(response), 200);
		};
	}

	public signIn() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const input = await this.readBody(context);

			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin', 403);
			}

			try {
				const outcome = await this.passwordSignInService.signIn(
					input,
					this.createMetadata(context.req.raw)
				);

				if (!outcome.ok) {
					return this.failure(context, outcome.errorCode, this.getFailureStatus(outcome.errorCode), outcome.fieldErrors);
				}

				context.header(
					'set-cookie',
					createSessionCookie(this.config, outcome.session.token, outcome.session.expiresAt)
				);

				return context.json<PasswordSignInResult>({
					ok: true,
					redirectTo: outcome.redirectTo
				}, 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.failure(context, 'unexpected', 500);
			}
		};
	}

	public signOut() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				assertSameOriginMutation(context.req.raw, this.config);
			}
			catch (error: unknown) {
				if (error instanceof InvalidMutationOriginError) {
					return this.failure(context, 'invalid-origin', 403);
				}

				throw error;
			}

			await this.sessionService.revokeSessionToken(
				readSessionCookie(context.req.raw, this.config.sessionCookieName)
			);
			context.header('set-cookie', createClearedSessionCookie(this.config));

			const response: PasswordSignOutResult = { ok: true };

			return context.json(passwordSignOutResultSchema.parse(response), 200);
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

	private createMetadata(request: Request) {
		const forwardedFor = request.headers.get('x-forwarded-for');

		return {
			ipAddress: forwardedFor?.split(',')[0]?.trim(),
			userAgent: request.headers.get('user-agent') ?? undefined
		};
	}

	private failure(
		context: Context<ApiEnvironment>,
		errorCode: keyof typeof passwordSignInErrorMessageByCode,
		status: AuthFailureStatus,
		fieldErrors?: Record<string, string>
	): Response {
		return context.json<PasswordSignInResult>({
			errorCode,
			fieldErrors,
			message: passwordSignInErrorMessageByCode[errorCode],
			ok: false
		}, status);
	}

	private getFailureStatus(
		errorCode: keyof typeof passwordSignInErrorMessageByCode
	): 400 | 401 | 429 {
		if (errorCode === 'invalid-input') {
			return 400;
		}

		if (errorCode === 'rate-limited') {
			return 429;
		}

		return 401;
	}
}
