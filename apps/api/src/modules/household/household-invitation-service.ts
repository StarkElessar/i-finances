import { randomUUID } from 'node:crypto';

import type { FixedWindowRateLimiter } from '@/modules/auth';

import {
	type AcceptInvitationInput,
	type ActiveHouseholdInvitation,
	type CreatedHouseholdInvitation,
	type HouseholdInvitationErrorCode,
	type HouseholdSummary,
	INVITATION_PAGE_PATH,
	type InvitationPreview,
	MAX_ACTIVE_HOUSEHOLD_INVITATIONS
} from '@i-finances/contracts';

import type { HouseholdInvitationConfig } from './household-invitation-config';
import type { HouseholdInvitationRepository } from './household-invitation-repository';
import { generateHouseholdInvitationToken, hashHouseholdInvitationToken } from './household-invitation-token';
import type { HouseholdResolver } from './household-resolver';

/** Invitations a household may create within 24 hours, whatever happens to them (Р11). */
export const MAX_HOUSEHOLD_INVITATIONS_PER_DAY = 10;

/** Requests whose address is unknown share one bucket: no address must never mean «no limit». */
const UNKNOWN_ADDRESS_KEY = 'unknown';

export type HouseholdInvitationServiceDependencies = {
	/** `POST /api/invitations/accept`: 10 per 5 minutes per user (Р11). */
	acceptRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
	config: HouseholdInvitationConfig;
	createId?: () => string;
	createToken?: () => string;
	householdResolver: Pick<HouseholdResolver, 'requireForUser'>;
	invitations: Pick<HouseholdInvitationRepository, 'accept' | 'create' | 'findActivePreview' | 'listActive' | 'revoke'>;
	now?: () => Date;
	/** `AUTH_ORIGIN`: the links point to the web application. */
	origin: string;
	/** `POST /api/invitations/preview`: 30 per 5 minutes per client address (Р11). */
	previewRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
};

export type HouseholdInvitationFailureOutcome = {
	currentHouseholdName?: string;
	errorCode: HouseholdInvitationErrorCode;
	ok: false;
	retryAfterSeconds?: number;
};

export type HouseholdInvitationOutcome<TValue> = ({ ok: true } & TValue) | HouseholdInvitationFailureOutcome;

function failure(errorCode: HouseholdInvitationErrorCode, retryAfterSeconds?: number): HouseholdInvitationFailureOutcome {
	return { errorCode, ok: false, retryAfterSeconds };
}

/**
 * Household invitations (Р5, flow 5.4). The owner creates, lists and revokes them from a browser session; a guest
 * previews one by its token and accepts it once signed in.
 *
 * The token is generated here, shown once inside the link and forgotten: only its SHA-256 goes further. A token that
 * does not open an active invitation is answered `invitation-unavailable` whatever the reason (unknown, expired, used,
 * revoked), on preview and on acceptance alike, so the answer tells nothing about invitations one does not hold. The
 * household of the caller always comes from their membership; the household joined always comes from the invitation.
 */
export class HouseholdInvitationService {
	private readonly createId: () => string;
	private readonly createToken: () => string;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: HouseholdInvitationServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.createToken = dependencies.createToken ?? generateHouseholdInvitationToken;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async create(userId: string): Promise<HouseholdInvitationOutcome<{ invitation: CreatedHouseholdInvitation }>> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);

		if (household.role !== 'owner') {
			return failure('owner-required');
		}

		const now = this.now();
		const token = this.createToken();
		const id = this.createId();
		const expiresAt = new Date(now.getTime() + this.dependencies.config.ttlMilliseconds);
		const creation = this.dependencies.invitations.create({
			createdAt: now,
			createdByUserId: userId,
			expiresAt,
			householdId: household.id,
			id,
			tokenHash: hashHouseholdInvitationToken(token)
		}, { maxActive: MAX_ACTIVE_HOUSEHOLD_INVITATIONS, maxPerDay: MAX_HOUSEHOLD_INVITATIONS_PER_DAY });

		switch (creation.kind) {
			case 'owner-required':
				return failure('owner-required');
			case 'active-limit':
				return failure('invitation-limit-reached');
			case 'daily-limit':
				return failure('rate-limited');
			case 'created':
				return {
					invitation: { expiresAt: expiresAt.toISOString(), id, link: this.buildLink(token) },
					ok: true
				};
		}
	}

	public async listActive(userId: string): Promise<HouseholdInvitationOutcome<{ invitations: ActiveHouseholdInvitation[] }>> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);

		if (household.role !== 'owner') {
			return failure('owner-required');
		}

		const records = await this.dependencies.invitations.listActive(household.id, this.now());

		return {
			invitations: records.map((record) => ({
				createdAt: record.createdAt.toISOString(),
				createdBy: { displayName: record.createdByDisplayName },
				expiresAt: record.expiresAt.toISOString(),
				id: record.id
			})),
			ok: true
		};
	}

	/** `invitation-not-found` for an unknown id, another household's invitation and one no longer active alike. */
	public async revoke(userId: string, invitationId: string): Promise<HouseholdInvitationOutcome<object>> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);

		if (household.role !== 'owner') {
			return failure('owner-required');
		}

		return this.dependencies.invitations.revoke(household.id, invitationId, userId, this.now())
			? { ok: true }
			: failure('invitation-not-found');
	}

	/** Public: no session needed. Limited per client address. */
	public async preview(
		token: string,
		ipAddress: string | undefined
	): Promise<HouseholdInvitationOutcome<{ invitation: InvitationPreview }>> {
		const now = this.now();
		const limit = this.dependencies.previewRateLimiter.tryConsume(ipAddress ?? UNKNOWN_ADDRESS_KEY, now.getTime());

		if (!limit.allowed) {
			return failure('rate-limited', limit.retryAfterSeconds);
		}

		const record = await this.dependencies.invitations.findActivePreview(hashHouseholdInvitationToken(token), now);

		if (record === undefined) {
			return failure('invitation-unavailable');
		}

		return {
			invitation: {
				expiresAt: record.expiresAt.toISOString(),
				householdName: record.householdName,
				inviterName: record.inviterName
			},
			ok: true
		};
	}

	/** Joins the household of the invitation as `member` (Р5, Р6). Limited per user. */
	public async accept(
		userId: string,
		input: AcceptInvitationInput
	): Promise<HouseholdInvitationOutcome<{ household: HouseholdSummary }>> {
		const now = this.now();
		const limit = this.dependencies.acceptRateLimiter.tryConsume(userId, now.getTime());

		if (!limit.allowed) {
			return failure('rate-limited', limit.retryAfterSeconds);
		}

		const acceptance = this.dependencies.invitations.accept({
			now,
			replaceEmptyHousehold: input.replaceEmptyHousehold,
			tokenHash: hashHouseholdInvitationToken(input.token),
			userId
		});

		switch (acceptance.kind) {
			case 'unavailable':
				return failure('invitation-unavailable');
			case 'already-in-household':
				return { ...failure('already-in-household'), currentHouseholdName: acceptance.currentHouseholdName };
			case 'confirmation-required':
				return { ...failure('empty-household-confirmation-required'), currentHouseholdName: acceptance.currentHouseholdName };
			case 'joined':
				return {
					household: { id: acceptance.householdId, name: acceptance.householdName, role: 'member' },
					ok: true
				};
		}
	}

	/**
	 * `<origin>/invite#<token>`: the token goes into the fragment, which the browser never sends to the server, so it
	 * lands neither in the access log of the page nor in a `Referer` (review decision A6, Р5).
	 */
	private buildLink(token: string): string {
		const link = new URL(INVITATION_PAGE_PATH, this.dependencies.origin);

		link.hash = token;

		return link.toString();
	}
}
