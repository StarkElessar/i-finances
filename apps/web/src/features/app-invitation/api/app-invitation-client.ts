import { ApiClient, type ApiClientOptions, ApiHttpError } from '@/shared/api';

import {
	appInvitationsResultSchema,
	type CreateAppInvitationInput,
	createAppInvitationResultSchema,
	revokeAppInvitationResultSchema
} from '@i-finances/contracts';
import type { z } from 'zod';

/** Preserve Retry-After alongside contract failures; no response or one-time link is cached here. */
export class AppInvitationClient {
	private readonly client: ApiClient;

	public constructor(options: ApiClientOptions = {}) {
		this.client = new ApiClient(options);
	}

	public list() {
		return this.request(() => this.client.get('/api/app-invitations', appInvitationsResultSchema), appInvitationsResultSchema);
	}

	public create(input: CreateAppInvitationInput) {
		return this.request(
			() => this.client.post('/api/app-invitations', input, createAppInvitationResultSchema),
			createAppInvitationResultSchema
		);
	}

	public revoke(id: string) {
		return this.request(
			() => this.client.post(`/api/app-invitations/${encodeURIComponent(id)}/revoke`, {}, revokeAppInvitationResultSchema),
			revokeAppInvitationResultSchema
		);
	}

	private async request<TResult extends { ok: boolean }>(
		run: () => Promise<TResult>,
		schema: z.ZodType<TResult>
	): Promise<TResult & { retryAfterSeconds?: number }> {
		try {
			return { ...await run() };
		}
		catch (error: unknown) {
			if (error instanceof ApiHttpError) {
				const parsed = schema.safeParse(error.body);

				if (parsed.success) {
					return { ...parsed.data, retryAfterSeconds: error.retryAfterSeconds };
				}
			}

			throw error;
		}
	}
}
