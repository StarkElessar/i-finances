import type { TelegramSecret, TelegramUpdateDispatcher } from '@/modules/telegram';
import { telegramUpdateSchema } from '@/modules/telegram';

import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { constantTimeEquals } from './constant-time-equals';
import type { ApiEnvironment } from './types';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
/** A real update is a few hundred bytes; 64 KB is generous and still bounds what a stranger can make us buffer. */
const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;

export type TelegramWebhookHttpControllerOptions = {
	bodyLimitBytes?: number;
	dispatcher: TelegramUpdateDispatcher;
	secret: TelegramSecret;
};

/**
 * Receives bot updates pushed by Telegram. There is no session and no origin check (Telegram sends neither): the only
 * credential is the `X-Telegram-Bot-Api-Secret-Token` header registered with `setWebhook`. The route is meant to be
 * mounted as `verifySecret()`, `bodyLimit()`, `receive()` in that order, so a stranger is rejected before the body is
 * read and the answer never contains data.
 *
 * Once the sender is authenticated, handler failures are logged and answered with 200 (see `TelegramUpdateDispatcher`).
 * Only a body that is not an update at all gets 400.
 */
export class TelegramWebhookHttpController {
	readonly #bodyLimitBytes: number;
	readonly #dispatcher: TelegramUpdateDispatcher;
	readonly #secret: TelegramSecret;

	public constructor(options: TelegramWebhookHttpControllerOptions) {
		this.#bodyLimitBytes = options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES;
		this.#dispatcher = options.dispatcher;
		this.#secret = options.secret;
	}

	public verifySecret(): MiddlewareHandler<ApiEnvironment> {
		return async (context, next) => {
			const provided = context.req.header(SECRET_HEADER);

			if (provided === undefined || !constantTimeEquals(this.#secret.reveal(), provided)) {
				return this.failure(context, 401, 'unauthorized', 'Unauthorized.');
			}

			await next();
		};
	}

	public bodyLimit(): MiddlewareHandler<ApiEnvironment> {
		return bodyLimit({
			maxSize: this.#bodyLimitBytes,
			onError: (context: Context<ApiEnvironment>) => this.failure(context, 413, 'payload_too_large', 'The request body is too large.')
		});
	}

	public receive() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			let body: unknown;

			try {
				body = await context.req.json();
			}
			catch {
				return this.failure(context, 400, 'invalid_update', 'The request body is not a valid update.');
			}

			const update = telegramUpdateSchema.safeParse(body);

			if (!update.success) {
				return this.failure(context, 400, 'invalid_update', 'The request body is not a valid update.');
			}

			await this.#dispatcher.dispatch(update.data);

			return context.json({ ok: true }, 200);
		};
	}

	private failure(context: Context<ApiEnvironment>, status: ContentfulStatusCode, code: string, message: string): Response {
		return context.json({ error: { code, message }, ok: false }, status);
	}
}
