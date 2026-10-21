import { ApiClient, type ApiClientOptions, ApiHttpError, beginSessionRotation, resolveCommandResult } from '@/shared/api';

import {
	type ChangePasswordInput,
	type ChangePasswordResult,
	changePasswordResultSchema,
	type DeleteSecurityPasskeyResult,
	deleteSecurityPasskeyResultSchema,
	type RevokeOtherSecuritySessionsResult,
	revokeOtherSecuritySessionsResultSchema,
	type RevokeSecuritySessionResult,
	revokeSecuritySessionResultSchema,
	type SecurityPasskeysResult,
	securityPasskeysResultSchema,
	type SecuritySessionsResult,
	securitySessionsResultSchema
} from '@i-finances/contracts';

/** The answer of a password change and, for a 429, how long the server asks to wait. */
export type ChangePasswordResponse = {
	result: ChangePasswordResult;
	retryAfterSeconds?: number;
};

export type SecurityClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

/**
 * Client of the «Безопасность» routes (`/api/security/*`). Domain failures (`last-passkey`, `current-session`, a wrong
 * current password, 429) come back as a value with `ok: false`; anything the contract does not know stays thrown.
 * Every route acts on the caller's own account: no user id is ever sent.
 */
export class SecurityClient {
	private readonly client: ApiClient;

	public constructor(options: SecurityClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public listPasskeys(): Promise<SecurityPasskeysResult> {
		return resolveCommandResult(
			() => this.client.get('/api/security/passkeys', securityPasskeysResultSchema),
			securityPasskeysResultSchema
		);
	}

	public deletePasskey(id: string): Promise<DeleteSecurityPasskeyResult> {
		return resolveCommandResult(
			() => this.client.delete(`/api/security/passkeys/${encodeURIComponent(id)}`, deleteSecurityPasskeyResultSchema),
			deleteSecurityPasskeyResultSchema
		);
	}

	/**
	 * `POST /api/security/password`. On success the answer carries the new session cookie (the old token is dead, see
	 * `session-rotation.md`); the browser applies it by itself. While the change is in flight, and for requests that left
	 * with the old cookie, a 401 is not taken for the end of the session (see `beginSessionRotation`). A refusal comes
	 * back as a value; a 429 also carries the `Retry-After` of the answer when the server sent one.
	 */
	public async changePassword(input: ChangePasswordInput): Promise<ChangePasswordResponse> {
		const settle = beginSessionRotation();

		try {
			const result = await this.client.post('/api/security/password', input, changePasswordResultSchema);

			settle(result.ok ? 'rotated' : 'failed');

			return { result };
		}
		catch (error: unknown) {
			settle('failed');

			if (error instanceof ApiHttpError) {
				const parsed = changePasswordResultSchema.safeParse(error.body);

				if (parsed.success) {
					return { result: parsed.data, retryAfterSeconds: error.retryAfterSeconds };
				}
			}

			throw error;
		}
	}

	public listSessions(): Promise<SecuritySessionsResult> {
		return resolveCommandResult(
			() => this.client.get('/api/security/sessions', securitySessionsResultSchema),
			securitySessionsResultSchema
		);
	}

	/** Another session of the caller. The current one is refused with 409 `current-session`. */
	public revokeSession(id: string): Promise<RevokeSecuritySessionResult> {
		return resolveCommandResult(
			() => this.client.delete(`/api/security/sessions/${encodeURIComponent(id)}`, revokeSecuritySessionResultSchema),
			revokeSecuritySessionResultSchema
		);
	}

	public revokeOtherSessions(): Promise<RevokeOtherSecuritySessionsResult> {
		return resolveCommandResult(
			() => this.client.delete('/api/security/sessions/others', revokeOtherSecuritySessionsResultSchema),
			revokeOtherSecuritySessionsResultSchema
		);
	}
}
