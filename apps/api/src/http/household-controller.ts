import { type AuthConfig, type AuthenticatedSession, getAuthConfig } from '@/modules/auth';
import {
	HouseholdAlreadyJoinedError,
	HouseholdOwnerRequiredError,
	type HouseholdService
} from '@/modules/household';

import {
	collectFieldErrors,
	createHouseholdInputSchema,
	type HouseholdDetails,
	type HouseholdErrorCode,
	householdErrorMessageByCode,
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
	'household-required': 403,
	'invalid-input': 400,
	'invalid-origin': 403,
	'owner-required': 403,
	unauthenticated: 401,
	unexpected: 500
};

/**
 * `GET`, `POST` and `PUT /api/household`: the caller's own household. A caller without a household gets
 * `household-required` from the shared application error mapping (`household-required-response.ts`), except on
 * `POST`, which is how onboarding creates one.
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
				(userId, input) => this.householdService.create(userId, input)
			);
		};
	}

	public update() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			return this.mutation(
				context,
				updateHouseholdInputSchema,
				200,
				(userId, input) => this.householdService.rename(userId, input)
			);
		};
	}

	private async mutation<TInput>(
		context: Context<ApiEnvironment>,
		schema: z.ZodType<TInput>,
		successStatus: 200 | 201,
		command: (userId: string, input: TInput) => Promise<HouseholdDetails>
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

		try {
			return this.success(context, await command(session.user.id, parsedInput.data), successStatus);
		}
		catch (error: unknown) {
			if (error instanceof HouseholdAlreadyJoinedError) {
				return this.failure(context, 'already-in-household');
			}

			if (error instanceof HouseholdOwnerRequiredError) {
				return this.failure(context, 'owner-required');
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
