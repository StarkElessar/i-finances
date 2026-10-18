import type { AuthConfig } from '@/modules/auth';
import type { TelegramSignInService } from '@/modules/telegram-auth';

import { getConnInfo } from '@hono/node-server/conninfo';
import {
	devTelegramConfirmResultSchema,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode
} from '@i-finances/contracts';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { isSameOriginMutation } from './mutation-origin';
import { TELEGRAM_SIGN_IN_STATUS_BY_ERROR_CODE } from './telegram-auth-controller';
import type { ApiEnvironment } from './types';

const BODY_LIMIT_BYTES = 1024;
/** The TCP peer addresses of this machine. Exactly these: no ranges, no names, nothing read from a header. */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Whether the TCP peer of the request is this machine. Only the socket counts: `Host`, `Origin` and
 * `X-Forwarded-For` are whatever the client sends (the same-origin check even trusts the origin made of `Host`), so a
 * machine in the local network could otherwise reach the route of a developer's API listening on all interfaces.
 */
function isLoopbackPeer(context: Context<ApiEnvironment>): boolean {
	let address: string | undefined;

	try {
		address = getConnInfo(context).remote.address;
	}
	catch {
		// No node server behind the request: nothing proves it is local.
		return false;
	}

	return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}

/** The answer of `createApiApp` for a route that does not exist. */
function notFound(context: Context<ApiEnvironment>): Response {
	return context.json({
		error: {
			code: 'not_found',
			message: 'The requested resource was not found.'
		},
		ok: false
	}, 404);
}

/**
 * `POST /api/dev/telegram/confirm` (`DEV_TELEGRAM_LOGIN=true`): stands in for the bot during local development, when
 * no dev bot is at hand. The composition root creates this controller only when the flag is on, and the Telegram
 * configuration refuses the flag in production, so the route does not exist there.
 *
 * It confirms a request for **any** Telegram id, so it opens every account of the database it runs on. Therefore it
 * answers only to a TCP peer on this machine (loopback) and looks like a missing route (404) to everyone else, and the
 * flag must never be switched on over a copy of the production database (`.env.example`).
 */
export class TelegramDevLoginHttpController {
	public constructor(
		private readonly service: TelegramSignInService,
		private readonly config: AuthConfig
	) {}

	/** Registered first, so that not even the body limit tells a remote client that the route exists. */
	public loopbackOnly(): MiddlewareHandler<ApiEnvironment> {
		return async (context, next) => {
			if (!isLoopbackPeer(context)) {
				return notFound(context);
			}

			await next();
		};
	}

	public bodyLimit() {
		return bodyLimit({
			maxSize: BODY_LIMIT_BYTES,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, 'payload-too-large')
		});
	}

	public confirm() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			// Again here, so the handler is safe even if it is ever registered without `loopbackOnly`.
			if (!isLoopbackPeer(context)) {
				return notFound(context);
			}

			if (!isSameOriginMutation(context.req.raw, this.config)) {
				return this.failure(context, 'invalid-origin');
			}

			let body: unknown;

			try {
				body = await context.req.json();
			}
			catch {
				body = undefined;
			}

			const outcome = await this.service.devConfirm(body);

			if (!outcome.ok) {
				return this.failure(context, outcome.errorCode);
			}

			return context.json(devTelegramConfirmResultSchema.parse({ ok: true }), 200);
		};
	}

	private failure(context: Context<ApiEnvironment>, errorCode: TelegramSignInErrorCode): Response {
		return context.json({
			errorCode,
			message: telegramSignInErrorMessageByCode[errorCode],
			ok: false
		}, TELEGRAM_SIGN_IN_STATUS_BY_ERROR_CODE[errorCode]);
	}
}
