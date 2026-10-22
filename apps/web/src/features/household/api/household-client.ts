import { ApiClient, type ApiClientOptions, resolveCommandResult } from '@/shared/api';

import {
	type HouseholdLeaveResult,
	householdLeaveResultSchema,
	type HouseholdResult,
	householdResultSchema
} from '@i-finances/contracts';

export type HouseholdClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

/**
 * The caller's own household and its members (`GET|POST|PUT /api/household`, `.../members/:userId/remove`, `.../leave`;
 * decision Р6, Р7, flow 5.5 of `development/decisions/telegram-auth-and-households-v1.md`).
 *
 * A domain refusal (409 `already-in-household`, 409 `last-owner`, 403 `owner-required`) comes back as a value with
 * `ok: false`; a network failure or a body nobody recognises stays a thrown error.
 */
export class HouseholdClient {
	private readonly client: ApiClient;

	public constructor(options: HouseholdClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public get(): Promise<HouseholdResult> {
		return resolveCommandResult(() => this.client.get('/api/household', householdResultSchema), householdResultSchema);
	}

	/** Onboarding: creates the household and makes the caller its owner. Base currency is BYN only (Р4). */
	public create(name: string): Promise<HouseholdResult> {
		return resolveCommandResult(() => this.client.post('/api/household', { name }, householdResultSchema), householdResultSchema);
	}

	/** Owner only. */
	public rename(name: string): Promise<HouseholdResult> {
		return resolveCommandResult(() => this.client.put('/api/household', { name }, householdResultSchema), householdResultSchema);
	}

	/** Owner only, never themselves; ends all sessions of the removed member (Р7). Answers the household without them. */
	public removeMember(userId: string): Promise<HouseholdResult> {
		return resolveCommandResult(
			() => this.client.post(`/api/household/members/${encodeURIComponent(userId)}/remove`, {}, householdResultSchema),
			householdResultSchema
		);
	}

	/** The session stays; the caller is in onboarding afterwards. */
	public leave(): Promise<HouseholdLeaveResult> {
		return resolveCommandResult(
			() => this.client.post('/api/household/leave', {}, householdLeaveResultSchema),
			householdLeaveResultSchema
		);
	}
}
