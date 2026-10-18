import type { AuthConfig } from '@/modules/auth';
import type { TelegramSignInService } from '@/modules/telegram-auth';

import {
	devTelegramConfirmResultSchema,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode
} from '@i-finances/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { isSameOriginMutation } from './mutation-origin';
import { TELEGRAM_SIGN_IN_STATUS_BY_ERROR_CODE } from './telegram-auth-controller';
import type { ApiEnvironment } from './types';

const BODY_LIMIT_BYTES = 1024;

/**
 * `POST /api/dev/telegram/confirm` (`DEV_TELEGRAM_LOGIN=true`): stands in for the bot during local development, when
 * no dev bot is at hand. The composition root creates this controller only when the flag is on, and the Telegram
 * configuration refuses the flag in production, so the route does not exist there.
 */
export class TelegramDevLoginHttpController {
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

	public confirm() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
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
