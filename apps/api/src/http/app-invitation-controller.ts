import type { AppInvitationOutcome, AppInvitationService } from '@/modules/app-invitation';
import type { AuthConfig, AuthenticatedSession, PlatformAdminPolicy } from '@/modules/auth';

import {
	type AppInvitationErrorCode,
	appInvitationErrorMessageByCode,
	type AppInvitationFailure,
	appInvitationsResultSchema,
	createAppInvitationResultSchema,
	revokeAppInvitationResultSchema
} from '@i-finances/contracts';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { isSameOriginMutation } from './mutation-origin';
import { respondNotFound } from './not-found-response';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

/** `{ "note": "<80 characters>" }` is a few hundred bytes at most, even in Cyrillic. */
const BODY_LIMIT_BYTES = 1024;

const STATUS_BY_ERROR_CODE: Record<AppInvitationErrorCode, ContentfulStatusCode> = {
	'invalid-input': 400,
	'invalid-origin': 403,
	'invitation-limit-reached': 409,
	'invitation-not-found': 404,
	'payload-too-large': 413,
	'rate-limited': 429,
	unauthenticated: 401,
	unexpected: 500
};

type Failure = { errorCode: AppInvitationErrorCode; fieldErrors?: Record<string, string> };

/**
 * Invitations into the application, platform administrator only (`development/decisions/app-invitations-v1.md`):
 * `POST /api/app-invitations`, `GET /api/app-invitations`, `POST /api/app-invitations/:id/revoke`.
 *
 * `adminOnly()` runs first on every route, before the body limit: no session (the MCP bearer key included: this
 * controller is wired with the browser cookie resolver only) is 401; a session of anyone who is not an administrator
 * is answered exactly like a route that does not exist (`respondNotFound`), whatever the method, body or origin, so
 * an ordinary user cannot tell the feature exists. Only then the mutations check the origin (Р11) and the body.
 */
export class AppInvitationHttpController {
	/** The administrator's session found by `adminOnly()`, per request (the context lives through the whole chain). */
	private readonly sessions = new WeakMap<Context, AuthenticatedSession>();

	public constructor(
		private readonly service: AppInvitationService,
		private readonly sessionResolver: RequestSessionResolver,
		private readonly platformAdmins: Pick<PlatformAdminPolicy, 'isPlatformAdmin'>,
		private readonly config: AuthConfig
	) {}

	public adminOnly(): MiddlewareHandler<ApiEnvironment> {
		return async (context: Context<ApiEnvironment>, next: Next): Promise<Response | undefined> => {
			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return this.failure(context, { errorCode: 'unauthenticated' });
			}

			if (!this.platformAdmins.isPlatformAdmin(session.user)) {
				return respondNotFound(context);
			}

			this.sessions.set(context, session);
			await next();

			return undefined;
		};
	}

	public bodyLimit() {
		return bodyLimit({
			maxSize: BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, { errorCode: 'payload-too-large' })
		});
	}

	public create() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.adminMutation(context, async (session) => {
				const outcome = await this.service.create(session.user, await this.readBody(context));

				if (!outcome.ok) {
					return this.refusal(context, outcome);
				}

				return context.json(createAppInvitationResultSchema.parse({ invitation: outcome.invitation, ok: true }), 201);
			});
		};
	}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = this.sessions.get(context);

			if (session === undefined) {
				return respondNotFound(context);
			}

			const outcome = await this.service.list(session.user);

			if (!outcome.ok) {
				return this.refusal(context, outcome);
			}

			return context.json(appInvitationsResultSchema.parse({ invitations: outcome.invitations, ok: true }), 200);
		};
	}

	public revoke() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.adminMutation(context, async (session) => {
				const outcome = await this.service.revoke(session.user, context.req.param('id') ?? '');

				if (!outcome.ok) {
					return this.refusal(context, outcome);
				}

				return context.json(revokeAppInvitationResultSchema.parse({ ok: true }), 200);
			});
		};
	}

	/** After `adminOnly()`: a route wired without it answers «not found», never runs. */
	private async adminMutation(
		context: Context<ApiEnvironment>,
		run: (session: AuthenticatedSession) => Promise<Response>
	): Promise<Response> {
		const session = this.sessions.get(context);

		if (session === undefined) {
			return respondNotFound(context);
		}

		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return this.failure(context, { errorCode: 'invalid-origin' });
		}

		return run(session);
	}

	/** An empty body is `{}` (the note is optional); a body that is not JSON reaches the schema as `undefined`. */
	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		const text = await context.req.text();

		if (text.trim() === '') {
			return {};
		}

		try {
			return JSON.parse(text) as unknown;
		}
		catch {
			return undefined;
		}
	}

	private refusal(context: Context<ApiEnvironment>, outcome: Exclude<AppInvitationOutcome<object>, { ok: true }>): Response {
		return 'notFound' in outcome ? respondNotFound(context) : this.failure(context, outcome);
	}

	private failure(context: Context<ApiEnvironment>, failure: Failure): Response {
		return context.json<AppInvitationFailure>({
			errorCode: failure.errorCode,
			fieldErrors: failure.fieldErrors,
			message: appInvitationErrorMessageByCode[failure.errorCode],
			ok: false
		}, STATUS_BY_ERROR_CODE[failure.errorCode]);
	}
}
