import { ApiClient, type ApiClientOptions } from '@/shared/api';

import { telegramRequestInit } from '@/features/telegram-request';

import {
	type TelegramLinkCompleteResult,
	telegramLinkCompleteResultSchema,
	type TelegramLinkStartResult,
	telegramLinkStartResultSchema,
	type TelegramSignInCancelResult,
	telegramSignInCancelResultSchema
} from '@i-finances/contracts';

export type TelegramLinkClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

/**
 * The three requests of the Telegram link (flow 5.3): `link/start`, `link/complete` and the shared `cancel`. They need
 * the browser session (never the MCP key). The request secret travels only in the httpOnly cookie that the browser
 * stores and sends by itself; a failure stays an `ApiHttpError` whose body is the contract failure (`Retry-After` on a 429).
 */
export class TelegramLinkClient {
	private readonly client: ApiClient;

	public constructor(options: TelegramLinkClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public startTelegramLink(): Promise<TelegramLinkStartResult> {
		return this.client.post('/api/auth/telegram/link/start', {}, telegramLinkStartResultSchema, telegramRequestInit());
	}

	/** One poll; `linked` carries the Telegram name to show to the person. */
	public completeTelegramLink(code: string): Promise<TelegramLinkCompleteResult> {
		return this.client.post('/api/auth/telegram/link/complete', { code }, telegramLinkCompleteResultSchema, telegramRequestInit());
	}

	/** The same route abandons a sign-in or a link request, whichever the code belongs to (`telegram-link.ts`). */
	public cancelTelegramLink(code: string): Promise<TelegramSignInCancelResult> {
		return this.client.post('/api/auth/telegram/cancel', { code }, telegramSignInCancelResultSchema, telegramRequestInit());
	}
}
