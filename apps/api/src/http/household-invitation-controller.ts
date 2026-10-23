import type { AuthConfig, AuthenticatedSession } from '@/modules/auth';
import type { HouseholdInvitationFailureOutcome, HouseholdInvitationService } from '@/modules/household';

import {
	acceptInvitationInputSchema,
	acceptInvitationResultSchema,
	collectFieldErrors,
	createHouseholdInvitationResultSchema,
	type HouseholdInvitationErrorCode,
	householdInvitationErrorMessageByCode,
	type HouseholdInvitationFailure,
	householdInvitationsResultSchema,
	invitationPreviewInputSchema,
	invitationPreviewResultSchema,
	revokeHouseholdInvitationResultSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { readClientIp } from './client-ip';
import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

/** `{ "token": "<43 characters>", "replaceEmptyHousehold": true }` is under 100 bytes. */
const BODY_LIMIT_BYTES = 1024;

const STATUS_BY_ERROR_CODE: Record<HouseholdInvitationErrorCode, ContentfulStatusCode> = {
	'already-in-household': 409,
	'app-invitation-not-acceptable': 409,
	'empty-household-confirmation-required': 409,
	'household-required': 403,
	'invalid-input': 400,
	'invalid-origin': 403,
	'invitation-limit-reached': 409,
	'invitation-not-found': 404,
	'invitation-unavailable': 404,
	'owner-required': 403,
	'payload-too-large': 413,
	'rate-limited': 429,
	unauthenticated: 401,
	unexpected: 500
};

/**
 * Household invitations (Р5, flow 5.4):
 * - `POST /api/household/invitations`, `GET /api/household/invitations`, `POST /api/household/invitations/:id/revoke`
 *   (owner of the caller's household);
 * - `POST /api/invitations/preview` (no session needed) and `POST /api/invitations/accept` (signed in).
 *
 * Wired with the **browser cookie** resolver only (review rule of A5): the household and its membership are managed
 * from a browser session, a leaked MCP key must not invite anyone into the family finances nor join anything.
 * Mutations and both guest routes pass the same-origin check (Р11). The token is read from the body only, never from
 * the path, and is never logged or echoed: answers go through their contract schemas.
 *
 * A caller without a household gets `household-required` from the shared mapping on the owner routes; the guest
 * routes work in onboarding, that is what they are for.
 */
export class HouseholdInvitationHttpController {
	public constructor(
		private readonly service: HouseholdInvitationService,
		private readonly sessionResolver: RequestSessionResolver,
		private readonly config: AuthConfig
	) {}

	public bodyLimit() {
		return bodyLimit({
			maxSize: BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, { errorCode: 'payload-too-large', ok: false })
		});
	}

	public create() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.signedInMutation(context, async (session) => {
				const outcome = await this.service.create(session.user.id);

				if (!outcome.ok) {
					return this.failure(context, outcome);
				}

				return context.json(createHouseholdInvitationResultSchema.parse({ invitation: outcome.invitation, ok: true }), 201);
			});
		};
	}

	public list() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.sessionResolver.resolve(context.req.raw);

			if (session === null) {
				return this.failure(context, { errorCode: 'unauthenticated', ok: false });
			}

			const outcome = await this.service.listActive(session.user.id);

			if (!outcome.ok) {
				return this.failure(context, outcome);
			}

			return context.json(householdInvitationsResultSchema.parse({ invitations: outcome.invitations, ok: true }), 200);
		};
	}

	public revoke() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.signedInMutation(context, async (session) => {
				const outcome = await this.service.revoke(session.user.id, context.req.param('id') ?? '');

				if (!outcome.ok) {
					return this.failure(context, outcome);
				}

				return context.json(revokeHouseholdInvitationResultSchema.parse({ ok: true }), 200);
			});
		};
	}

	public preview() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, { errorCode: 'invalid-origin', ok: false });
			}

			const parsedInput = invitationPreviewInputSchema.safeParse(await this.readBody(context));

			if (!parsedInput.success) {
				return this.failure(context, { errorCode: 'invalid-input', ok: false }, collectFieldErrors(parsedInput.error));
			}

			const outcome = await this.service.preview(parsedInput.data.token, readClientIp(context, this.config.trustedProxyCount));

			if (!outcome.ok) {
				return this.failure(context, outcome);
			}

			return context.json(invitationPreviewResultSchema.parse({ invitation: outcome.invitation, ok: true }), 200);
		};
	}

	public accept() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.signedInMutation(context, async (session) => {
				const parsedInput = acceptInvitationInputSchema.safeParse(await this.readBody(context));

				if (!parsedInput.success) {
					return this.failure(context, { errorCode: 'invalid-input', ok: false }, collectFieldErrors(parsedInput.error));
				}

				const outcome = await this.service.accept(session.user.id, parsedInput.data);

				if (!outcome.ok) {
					return this.failure(context, outcome);
				}

				return context.json(acceptInvitationResultSchema.parse({ household: outcome.household, ok: true }), 200);
			});
		};
	}

	private async signedInMutation(
		context: Context<ApiEnvironment>,
		run: (session: AuthenticatedSession) => Promise<Response>
	): Promise<Response> {
		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return this.failure(context, { errorCode: 'invalid-origin', ok: false });
		}

		const session = await this.sessionResolver.resolve(context.req.raw);

		if (session === null) {
			return this.failure(context, { errorCode: 'unauthenticated', ok: false });
		}

		return run(session);
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private failure(
		context: Context<ApiEnvironment>,
		outcome: HouseholdInvitationFailureOutcome,
		fieldErrors?: Record<string, string>
	): Response {
		if (outcome.retryAfterSeconds !== undefined) {
			context.header('retry-after', String(outcome.retryAfterSeconds));
		}

		return context.json<HouseholdInvitationFailure>({
			currentHousehold: outcome.currentHouseholdName === undefined ? undefined : { name: outcome.currentHouseholdName },
			errorCode: outcome.errorCode,
			fieldErrors,
			message: householdInvitationErrorMessageByCode[outcome.errorCode],
			ok: false,
			reason: outcome.errorCode === 'invitation-unavailable' ? outcome.reason : undefined
		}, STATUS_BY_ERROR_CODE[outcome.errorCode]);
	}
}
