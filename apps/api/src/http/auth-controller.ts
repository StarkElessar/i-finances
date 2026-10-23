import type { PasswordUserRepository, SessionService } from '@/modules/auth';
import type { PasswordSignInService } from '@/modules/auth';
import {
	type AuthConfig,
	getAuthConfig,
	type PlatformAdminPolicy,
	type SignInMethodsPort
} from '@/modules/auth';
import type { HouseholdResolver } from '@/modules/household';

import {
	type CurrentSessionResponse,
	currentSessionResponseSchema,
	passwordSignInErrorMessageByCode,
	type PasswordSignInResult,
	type PasswordSignOutResult,
	passwordSignOutResultSchema,
	type UpdateDisplayNameErrorCode,
	updateDisplayNameErrorMessageByCode,
	updateDisplayNameInputSchema,
	type UpdateDisplayNameResult
} from '@i-finances/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { readClientIp } from './client-ip';
import {
	assertSameOriginMutation,
	InvalidMutationOriginError,
	isSameOriginMutation
} from './mutation-origin';
import { createClearedSessionCookie, createSessionCookie, readSessionCookie } from './session-cookie';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

type AuthFailureStatus = 400 | 401 | 403 | 413 | 429 | 500;

const SIGN_IN_BODY_LIMIT_BYTES = 16 * 1024;

export class AuthHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly passwordSignInService: PasswordSignInService,
		private readonly sessionService: SessionService,
		private readonly sessionResolver: RequestSessionResolver,
		private readonly passwordUserRepository: PasswordUserRepository,
		private readonly householdResolver: HouseholdResolver,
		private readonly signInMethods: SignInMethodsPort,
		private readonly platformAdmins: Pick<PlatformAdminPolicy, 'isPlatformAdmin'>,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public currentSession() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return context.json(currentSessionResponseSchema.parse({ authenticated: false }), 200);
			}

			// Read on every call, like the household routes: a removed member sees `null` right away.
			const household = await this.householdResolver.findForUser(session.user.id);
			const methods = await this.signInMethods.read(session.user.id);
			const response: CurrentSessionResponse = {
				authenticated: true,
				hasPassword: methods?.hasPassword ?? false,
				household: household === undefined
					? null
					: { id: household.id, name: household.name, role: household.role },
				// By the login of this session only (PLATFORM_ADMIN_USERNAMES); for a bearer (MCP) session too, harmless:
				// the administrator's routes take the browser cookie only.
				isPlatformAdmin: this.platformAdmins.isPlatformAdmin(session.user),
				telegram: methods?.telegram ?? null,
				user: {
					displayName: session.user.displayName,
					id: session.user.id,
					username: session.user.username
				}
			};

			return context.json(currentSessionResponseSchema.parse(response), 200);
		};
	}

	/**
	 * Caps the body of the public sign-in route before anything buffers it, with or without `Content-Length`. The
	 * largest valid body (64-character username, 256-character password, 2048-character `returnTo`, up to 4 bytes per
	 * character) is under 12 KiB.
	 */
	public signInBodyLimit() {
		return bodyLimit({
			maxSize: SIGN_IN_BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, 'payload-too-large', 413)
		});
	}

	public signIn() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			// Before the body is read: a cross-origin request costs no parsing.
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin', 403);
			}

			const input = await this.readBody(context);

			try {
				const outcome = await this.passwordSignInService.signIn(
					input,
					this.createMetadata(context)
				);

				if (!outcome.ok) {
					if (outcome.retryAfterSeconds !== undefined) {
						context.header('retry-after', String(outcome.retryAfterSeconds));
					}

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

	public updateDisplayName() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			try {
				assertSameOriginMutation(context.req.raw, this.config);
			}
			catch (error: unknown) {
				if (error instanceof InvalidMutationOriginError) {
					return this.updateDisplayNameFailure(context, 'invalid-origin', 403);
				}

				throw error;
			}

			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return this.updateDisplayNameFailure(context, 'unauthenticated', 401);
			}

			const parsed = updateDisplayNameInputSchema.safeParse(await this.readBody(context));

			if (!parsed.success) {
				return this.updateDisplayNameFailure(context, 'invalid-input', 400);
			}

			try {
				await this.passwordUserRepository.updateDisplayName(session.user.id, parsed.data.displayName);

				return context.json<UpdateDisplayNameResult>({
					displayName: parsed.data.displayName,
					ok: true
				}, 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.updateDisplayNameFailure(context, 'unexpected', 500);
			}
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

	private createMetadata(context: Context<ApiEnvironment>) {
		return {
			ipAddress: readClientIp(context, this.config.trustedProxyCount),
			userAgent: context.req.header('user-agent')
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

	private updateDisplayNameFailure(
		context: Context<ApiEnvironment>,
		errorCode: UpdateDisplayNameErrorCode,
		status: AuthFailureStatus
	): Response {
		return context.json<UpdateDisplayNameResult>({
			errorCode,
			message: updateDisplayNameErrorMessageByCode[errorCode],
			ok: false
		}, status);
	}
}
