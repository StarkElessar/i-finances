import { ApiClient, type ApiClientOptions, resolveCommandResult } from '@/shared/api';

import {
	type CreateHouseholdInvitationResult,
	createHouseholdInvitationResultSchema,
	type HouseholdInvitationsResult,
	householdInvitationsResultSchema,
	type RevokeHouseholdInvitationResult,
	revokeHouseholdInvitationResultSchema
} from '@i-finances/contracts';

export type HouseholdInvitationClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

/**
 * The owner's side of the invitations (`GET|POST /api/household/invitations`, `.../:id/revoke`; Р5, flow 5.4). Browser
 * session only: the MCP key gets 401 there. The link of a created invitation is in the answer once and cannot be read
 * again, so nothing here keeps it.
 */
export class HouseholdInvitationClient {
	private readonly client: ApiClient;

	public constructor(options: HouseholdInvitationClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	/** The active invitations of the household, without links. */
	public list(): Promise<HouseholdInvitationsResult> {
		return resolveCommandResult(
			() => this.client.get('/api/household/invitations', householdInvitationsResultSchema),
			householdInvitationsResultSchema
		);
	}

	/** 409 `invitation-limit-reached` comes back as a value when three are already active. */
	public create(): Promise<CreateHouseholdInvitationResult> {
		return resolveCommandResult(
			() => this.client.post('/api/household/invitations', {}, createHouseholdInvitationResultSchema),
			createHouseholdInvitationResultSchema
		);
	}

	public revoke(id: string): Promise<RevokeHouseholdInvitationResult> {
		return resolveCommandResult(
			() => this.client.post(
				`/api/household/invitations/${encodeURIComponent(id)}/revoke`,
				{},
				revokeHouseholdInvitationResultSchema
			),
			revokeHouseholdInvitationResultSchema
		);
	}
}
