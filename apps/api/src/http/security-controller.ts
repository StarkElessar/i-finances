import {
	type AuthConfig,
	getAuthConfig,
	type SecurityActor,
	type SecurityService
} from '@/modules/auth';

import {
	changePasswordResultSchema,
	deleteSecurityPasskeyResultSchema,
	revokeOtherSecuritySessionsResultSchema,
	revokeSecuritySessionResultSchema,
	type SecurityErrorCode,
	securityErrorMessageByCode,
	type SecurityFailure,
	securityPasskeysResultSchema,
	securitySessionsResultSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

type SecurityResult = { ok: boolean } & Partial<Pick<SecurityFailure, 'errorCode'>>;

/**
 * A wrong current password is reported as 400, not 401/403: clients treat 401
 * as «the session ended» and would sign the user out for a simple typo.
 */
const STATUS_BY_ERROR_CODE: Record<SecurityErrorCode, ContentfulStatusCode> = {
	'current-session': 409,
	'invalid-current-password': 400,
	'invalid-input': 400,
	'invalid-origin': 403,
	'last-passkey': 409,
	'not-found': 404,
	'password-unchanged': 400,
	'rate-limited': 429,
	unauthenticated: 401,
	unexpected: 500
};

/**
 * Adapts the security service to HTTP. Every route acts on the caller's own
 * account: the user comes from the session, never from the path or the body.
 *
 * Must be wired with a browser-cookie resolver only. The MCP bearer key is a
 * machine credential and must not be able to change passwords or end sessions.
 */
export class SecurityHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly service: SecurityService,
		private readonly sessionResolver: RequestSessionResolver,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public listPasskeys() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.handle(context, false, securityPasskeysResultSchema, (actor) => this.service.listPasskeys(actor));
		};
	}

	public deletePasskey() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.handle(
				context,
				true,
				deleteSecurityPasskeyResultSchema,
				(actor) => this.service.deletePasskey(actor, context.req.param('id') ?? '')
			);
		};
	}

	public changePassword() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const body = await this.readBody(context);

			return this.handle(
				context,
				true,
				changePasswordResultSchema,
				(actor) => this.service.changePassword(actor, body)
			);
		};
	}

	public listSessions() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.handle(context, false, securitySessionsResultSchema, (actor) => this.service.listSessions(actor));
		};
	}

	public revokeSession() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.handle(
				context,
				true,
				revokeSecuritySessionResultSchema,
				(actor) => this.service.revokeSession(actor, context.req.param('id') ?? '')
			);
		};
	}

	public revokeOtherSessions() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.handle(
				context,
				true,
				revokeOtherSecuritySessionsResultSchema,
				(actor) => this.service.revokeOtherSessions(actor)
			);
		};
	}

	private async handle<TResult extends SecurityResult>(
		context: Context<ApiEnvironment>,
		isMutation: boolean,
		schema: z.ZodType<TResult>,
		command: (actor: SecurityActor) => Promise<TResult>
	): Promise<Response> {
		if (isMutation && !isSameOriginMutation(context.req.raw, this.config)) {
			return this.failure(context, 'invalid-origin');
		}

		const session = await this.sessionResolver.resolve(context.req.raw);

		if (session === null) {
			return this.failure(context, 'unauthenticated');
		}

		try {
			const result = schema.parse(await command({ sessionId: session.id, userId: session.user.id }));

			return context.json(
				result,
				result.ok || result.errorCode === undefined ? 200 : STATUS_BY_ERROR_CODE[result.errorCode]
			);
		}
		catch (error: unknown) {
			console.error(error);

			return this.failure(context, 'unexpected');
		}
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private failure(context: Context<ApiEnvironment>, errorCode: SecurityErrorCode): Response {
		const body: SecurityFailure = {
			errorCode,
			message: securityErrorMessageByCode[errorCode],
			ok: false
		};

		return context.json(body, STATUS_BY_ERROR_CODE[errorCode]);
	}
}
