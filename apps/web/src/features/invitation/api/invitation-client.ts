import { ApiClient, type ApiClientOptions, resolveCommandResult } from '@/shared/api';

import {
	type AcceptInvitationResult,
	acceptInvitationResultSchema,
	type InvitationPreviewResult,
	invitationPreviewResultSchema
} from '@i-finances/contracts';

export type InvitationClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

/**
 * The guest's side of an invitation: `POST /api/invitations/preview` (no session needed) and `.../accept` (signed in;
 * Р5, flow 5.4). The token goes in the request body only, never in a path or a query, so it does not reach any access
 * log, and this client neither logs it nor keeps it.
 *
 * A dead link is a value (`ok: false`, 404 `invitation-unavailable`, with the optional `reason`), not a thrown error.
 */
export class InvitationClient {
	private readonly client: ApiClient;

	public constructor(options: InvitationClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public preview(token: string): Promise<InvitationPreviewResult> {
		return resolveCommandResult(
			() => this.client.post('/api/invitations/preview', { token }, invitationPreviewResultSchema),
			invitationPreviewResultSchema
		);
	}

	/**
	 * `replaceEmptyHousehold` is the person's consent to delete their own empty household on joining; without it 409
	 * `empty-household-confirmation-required` asks for it and nothing changes.
	 */
	public accept(token: string, replaceEmptyHousehold: boolean): Promise<AcceptInvitationResult> {
		return resolveCommandResult(
			() => this.client.post('/api/invitations/accept', { replaceEmptyHousehold, token }, acceptInvitationResultSchema),
			acceptInvitationResultSchema
		);
	}
}
