import type { AuthConfig } from '@/modules/auth';
import type { TelegramLinkMetadata, TelegramLinkService } from '@/modules/telegram-auth';

import {
	type TelegramLinkCompleteResult,
	telegramLinkCompleteResultSchema,
	type TelegramLinkErrorCode,
	telegramLinkErrorMessageByCode,
	type TelegramLinkStartResult,
	telegramLinkStartResultSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { readClientIp } from './client-ip';
import { isSameOriginMutation } from './mutation-origin';
import type { RequestSessionResolver } from './session-resolver';
import {
	createClearedTelegramLoginCookie,
	createTelegramLoginCookie,
	readTelegramLoginCookie
} from './telegram-login-cookie';
import type { ApiEnvironment } from './types';

/** `{ "code": "<32 characters>" }` is about 50 bytes. */
const BODY_LIMIT_BYTES = 1024;

const STATUS_BY_ERROR_CODE: Record<TelegramLinkErrorCode, ContentfulStatusCode> = {
	'account-has-telegram': 409,
	'browser-mismatch': 403,
	'invalid-input': 400,
	'invalid-origin': 403,
	'link-expired': 410,
	'link-rejected': 410,
	'payload-too-large': 413,
	'rate-limited': 429,
	'telegram-linked-elsewhere': 409,
	'telegram-unavailable': 404,
	unauthenticated: 401,
	unexpected: 500
};

/**
 * `POST /api/auth/telegram/link/start` and `.../link/complete` (flow 5.3). Both act on the caller's own account only:
 * the user comes from the session, never from the body. Must be wired with the **browser cookie** resolver: the MCP
 * bearer key is a machine credential and must not attach a Telegram (a new way to sign in as its user) to anyone.
 * Both are browser mutations and pass the same-origin check (Р11). The request secret travels only in the httpOnly
 * cookie of the Telegram routes (`Path=/api/auth/telegram`). The session cookie is left as it is: linking keeps the
 * user signed in.
 */
export class TelegramLinkHttpController {
	public constructor(
		private readonly service: TelegramLinkService,
		private readonly sessionResolver: RequestSessionResolver,
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
				const session = await this.sessionResolver.resolve(context.req.raw);

				if (session === null) {
					return this.failure(context, 'unauthenticated');
				}

				const outcome = await this.service.start({ userId: session.user.id }, this.metadata(context));

				if (!outcome.ok) {
					return this.failure(context, outcome.errorCode, outcome.retryAfterSeconds);
				}

				context.header('set-cookie', createTelegramLoginCookie(outcome.secret, outcome.ttlMilliseconds / 1000));

				return context.json(telegramLinkStartResultSchema.parse({
					appUrl: outcome.appUrl,
					botUrl: outcome.botUrl,
					code: outcome.code,
					expiresAt: outcome.expiresAt.toISOString(),
					ok: true
				} satisfies TelegramLinkStartResult), 200);
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
				const session = await this.sessionResolver.resolve(context.req.raw);

				if (session === null) {
					return this.failure(context, 'unauthenticated');
				}

				const outcome = await this.service.complete(
					{ userId: session.user.id },
					await this.readBody(context),
					readTelegramLoginCookie(context.req.raw),
					this.metadata(context)
				);

				if (outcome.kind === 'pending') {
					return context.json(telegramLinkCompleteResultSchema.parse({ ok: true, status: 'pending' }), 200);
				}

				if (outcome.kind === 'failed') {
					if (outcome.endsRequest) {
						context.header('set-cookie', createClearedTelegramLoginCookie());
					}

					return this.failure(context, outcome.errorCode, outcome.retryAfterSeconds);
				}

				context.header('set-cookie', createClearedTelegramLoginCookie());

				return context.json(telegramLinkCompleteResultSchema.parse({
					ok: true,
					status: 'linked',
					telegram: { username: outcome.username }
				} satisfies TelegramLinkCompleteResult), 200);
			}
			catch (error: unknown) {
				console.error(error);

				return this.failure(context, 'unexpected');
			}
		};
	}

	private metadata(context: Context<ApiEnvironment>): TelegramLinkMetadata {
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

	private failure(context: Context<ApiEnvironment>, errorCode: TelegramLinkErrorCode, retryAfterSeconds?: number): Response {
		if (retryAfterSeconds !== undefined) {
			context.header('retry-after', String(retryAfterSeconds));
		}

		return context.json({
			errorCode,
			message: telegramLinkErrorMessageByCode[errorCode],
			ok: false
		}, STATUS_BY_ERROR_CODE[errorCode]);
	}
}
