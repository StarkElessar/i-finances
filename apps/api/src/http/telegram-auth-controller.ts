import type { AuthConfig } from '@/modules/auth';
import type { TelegramSignInMetadata, TelegramSignInService } from '@/modules/telegram-auth';

import {
	type TelegramSignInCancelResult,
	telegramSignInCancelResultSchema,
	type TelegramSignInCompleteResult,
	telegramSignInCompleteResultSchema,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode,
	type TelegramSignInStartResult,
	telegramSignInStartResultSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { readClientIp } from './client-ip';
import { isSameOriginMutation } from './mutation-origin';
import { createSessionCookie } from './session-cookie';
import {
	createClearedTelegramLoginCookie,
	createTelegramLoginCookie,
	readTelegramLoginCookie
} from './telegram-login-cookie';
import type { ApiEnvironment } from './types';

/** `{ "code": "<32 characters>" }` is about 50 bytes. */
const BODY_LIMIT_BYTES = 1024;

export const TELEGRAM_SIGN_IN_STATUS_BY_ERROR_CODE: Record<TelegramSignInErrorCode, ContentfulStatusCode> = {
	'account-disabled': 403,
	'browser-mismatch': 403,
	'invalid-input': 400,
	'invalid-origin': 403,
	'login-expired': 410,
	'login-rejected': 410,
	'payload-too-large': 413,
	'rate-limited': 429,
	'registration-closed': 403,
	'telegram-unavailable': 404,
	unexpected: 500
};

/**
 * `POST /api/auth/telegram/start`, `.../complete` and `.../cancel` (flow 5.1). No session is needed: these routes
 * are how a session is obtained. All three are browser mutations and pass the same-origin check (Р11); the request
 * secret travels only in the httpOnly cookie set by `start`, never in a body or an answer. Every answer goes through its
 * contract schema, so nothing beyond the contract (and nothing about a user before confirmation) can leak.
 */
export class TelegramAuthHttpController {
	public constructor(
		private readonly service: TelegramSignInService,
		private readonly config: AuthConfig
	) {}

	public bodyLimit() {
		return bodyLimit({
			maxSize: BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, 'payload-too-large')
		});
	}

	public start() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin');
			}

			try {
				const outcome = await this.service.start(this.metadata(context));

				if (!outcome.ok) {
					return this.failure(context, outcome.errorCode, outcome.retryAfterSeconds);
				}

				context.header('set-cookie', createTelegramLoginCookie(outcome.secret, outcome.ttlMilliseconds / 1000));

				return context.json(telegramSignInStartResultSchema.parse({
					appUrl: outcome.appUrl,
					botUrl: outcome.botUrl,
					code: outcome.code,
					expiresAt: outcome.expiresAt.toISOString(),
					ok: true
				} satisfies TelegramSignInStartResult), 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.failure(context, 'unexpected');
			}
		};
	}

	public complete() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin');
			}

			try {
				const outcome = await this.service.complete(
					await this.readBody(context),
					readTelegramLoginCookie(context.req.raw),
					this.metadata(context)
				);

				if (outcome.kind === 'pending') {
					return context.json(telegramSignInCompleteResultSchema.parse({ ok: true, status: 'pending' }), 200);
				}

				if (outcome.kind === 'failed') {
					if (outcome.endsRequest) {
						context.header('set-cookie', createClearedTelegramLoginCookie());
					}

					return this.failure(context, outcome.errorCode, outcome.retryAfterSeconds);
				}

				context.header('set-cookie', createSessionCookie(this.config, outcome.session.token, outcome.session.expiresAt));
				context.header('set-cookie', createClearedTelegramLoginCookie(), { append: true });

				return context.json(telegramSignInCompleteResultSchema.parse({
					hasHousehold: outcome.hasHousehold,
					isNewUser: outcome.isNewUser,
					ok: true,
					status: 'confirmed'
				} satisfies TelegramSignInCompleteResult), 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.failure(context, 'unexpected');
			}
		};
	}

	public cancel() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin');
			}

			try {
				const outcome = await this.service.cancel(
					await this.readBody(context),
					readTelegramLoginCookie(context.req.raw),
					this.metadata(context)
				);

				if (!outcome.ok) {
					return this.failure(context, outcome.errorCode, outcome.retryAfterSeconds);
				}

				context.header('set-cookie', createClearedTelegramLoginCookie());

				return context.json(telegramSignInCancelResultSchema.parse({ ok: true } satisfies TelegramSignInCancelResult), 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.failure(context, 'unexpected');
			}
		};
	}

	private metadata(context: Context<ApiEnvironment>): TelegramSignInMetadata {
		return {
			ipAddress: readClientIp(context, this.config.trustedProxyCount),
			userAgent: context.req.header('user-agent')
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

	private failure(context: Context<ApiEnvironment>, errorCode: TelegramSignInErrorCode, retryAfterSeconds?: number): Response {
		if (retryAfterSeconds !== undefined) {
			context.header('retry-after', String(retryAfterSeconds));
		}

		return context.json({
			errorCode,
			message: telegramSignInErrorMessageByCode[errorCode],
			ok: false
		}, TELEGRAM_SIGN_IN_STATUS_BY_ERROR_CODE[errorCode]);
	}
}
