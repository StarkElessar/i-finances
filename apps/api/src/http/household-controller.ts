import { type AuthConfig, type AuthenticatedSession, getAuthConfig, type SessionUser } from '@/modules/auth';
import {
	HouseholdAlreadyJoinedError,
	HouseholdCreationNotAllowedError,
	HouseholdLastOwnerError,
	HouseholdMemberNotFoundError,
	HouseholdOwnerRequiredError,
	HouseholdSelfRemovalError,
	type HouseholdService
} from '@/modules/household';

import {
	collectFieldErrors,
	createHouseholdInputSchema,
	type HouseholdDetails,
	type HouseholdErrorCode,
	householdErrorMessageByCode,
	type HouseholdLeaveResult,
	type HouseholdResult,
	updateHouseholdInputSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

const STATUS_BY_ERROR_CODE: Record<HouseholdErrorCode, ContentfulStatusCode> = {
	'already-in-household': 409,
	'cannot-remove-self': 409,
	'household-creation-not-allowed': 403,
	'household-required': 403,
	'invalid-input': 400,
	'invalid-origin': 403,
	'last-owner': 409,
	'member-not-found': 404,
	'owner-required': 403,
	unauthenticated: 401,
	unexpected: 500
};

/**
 * `GET`, `POST` and `PUT /api/household`, `POST /api/household/members/:userId/remove` and `POST /api/household/leave`:
 * the caller's own household and its members (Р6, Р7, flow 5.5). A caller without a household gets
 * `household-required` from the shared application error mapping (`household-required-response.ts`), except on
 * `POST`, which is how onboarding creates one: 403 `household-creation-not-allowed` when the caller may not found a
 * household (`HouseholdCreationPolicy`), 409 `already-in-household` when they may but already belong to one.
 *
 * The composition root gives it the browser cookie resolver only: managing the household and its membership is
 * not something the MCP bearer key may do.
 */
export class HouseholdHttpController {
	private readonly config: AuthConfig;

	public constructor(
		private readonly householdService: HouseholdService,
		private readonly sessionResolver: RequestSessionResolver,
		config: AuthConfig = getAuthConfig()
	) {
		this.config = config;
	}

	public get() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.failure(context, 'unauthenticated');
			}

			return this.success(context, await this.householdService.get(session.user.id), 200);
		};
	}

	public create() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.mutation(
				context,
				createHouseholdInputSchema,
				201,
				(user, input) => this.householdService.create(user, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.mutation(
				context,
				updateHouseholdInputSchema,
				200,
				(user, input) => this.householdService.rename(user.id, input)
			);
		};
	}

	/** Owner only, never themselves: ends all sessions of the removed member in the same transaction (Р7). */
	public removeMember() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.command(context, async (userId) => this.success(
				context,
				await this.householdService.removeMember(userId, context.req.param('userId') ?? ''),
				200
			));
		};
	}

	/** The caller leaves; the session stays and the caller is in onboarding afterwards. */
	public leave() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.command(context, async (userId) => {
				await this.householdService.leave(userId);

				return context.json<HouseholdLeaveResult>({ ok: true }, 200);
			});
		};
	}

	private async mutation<TInput>(
		context: Context<ApiEnvironment>,
		schema: z.ZodType<TInput>,
		successStatus: 200 | 201,
		command: (user: SessionUser, input: TInput) => Promise<HouseholdDetails>
	): Promise<Response> {
		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return this.failure(context, 'invalid-origin');
		}

		const session = await this.requireSession(context);

		if (session === undefined) {
			return this.failure(context, 'unauthenticated');
		}

		const parsedInput = schema.safeParse(await this.readBody(context));

		if (!parsedInput.success) {
			return this.failure(context, 'invalid-input', collectFieldErrors(parsedInput.error));
		}

		return this.mapErrors(context, async () => this.success(context, await command(session.user, parsedInput.data), successStatus));
	}

	/** A mutation without a body: same-origin check, browser session, then the command. */
	private async command(
		context: Context<ApiEnvironment>,
		run: (userId: string) => Promise<Response>
	): Promise<Response> {
		if (!isSameOriginMutation(context.req.raw, this.config)) {
			return this.failure(context, 'invalid-origin');
		}

		const session = await this.requireSession(context);

		if (session === undefined) {
			return this.failure(context, 'unauthenticated');
		}

		return this.mapErrors(context, () => run(session.user.id));
	}

	/** Domain errors to their codes; `HouseholdAccessRequiredError` goes on to the shared mapping. */
	private async mapErrors(context: Context<ApiEnvironment>, run: () => Promise<Response>): Promise<Response> {
		try {
			return await run();
		}
		catch (error: unknown) {
			if (error instanceof HouseholdAlreadyJoinedError) {
				return this.failure(context, 'already-in-household');
			}

			if (error instanceof HouseholdCreationNotAllowedError) {
				return this.failure(context, 'household-creation-not-allowed');
			}

			if (error instanceof HouseholdOwnerRequiredError) {
				return this.failure(context, 'owner-required');
			}

			if (error instanceof HouseholdMemberNotFoundError) {
				return this.failure(context, 'member-not-found');
			}

			if (error instanceof HouseholdSelfRemovalError) {
				return this.failure(context, 'cannot-remove-self');
			}

			if (error instanceof HouseholdLastOwnerError) {
				return this.failure(context, 'last-owner');
			}

			throw error;
		}
	}

	private async requireSession(context: Context<ApiEnvironment>): Promise<AuthenticatedSession | undefined> {
		return await this.sessionResolver.resolve(context.req.raw) ?? undefined;
	}

	private async readBody(context: Context<ApiEnvironment>): Promise<unknown> {
		try {
			return await context.req.json();
		}
		catch {
			return undefined;
		}
	}

	private success(context: Context<ApiEnvironment>, household: HouseholdDetails, status: 200 | 201): Response {
		return context.json<HouseholdResult>({ household, ok: true }, status);
	}

	private failure(
		context: Context<ApiEnvironment>,
		errorCode: HouseholdErrorCode,
		fieldErrors?: Record<string, string>
	): Response {
		return context.json<HouseholdResult>({
			errorCode,
			fieldErrors,
			message: householdErrorMessageByCode[errorCode],
			ok: false
		}, STATUS_BY_ERROR_CODE[errorCode]);
	}
}
