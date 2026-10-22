import type { AppDatabase } from '@/infrastructure/database/client';
import { appInvitations, telegramAccounts, users } from '@/infrastructure/database/schema';
import { invitationUnavailableReason } from '@/modules/household';

import type { HouseholdInvitationUnavailableReason } from '@i-finances/contracts';
import { and, desc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

export type NewAppInvitation = {
	createdAt: Date;
	createdByUserId: string;
	expiresAt: Date;
	id: string;
	note: string | null;
	/** SHA-256 hex of the token; the token itself never reaches the repository. */
	tokenHash: string;
};

export type AppInvitationLimits = {
	/** Active (not accepted, not revoked, not expired) invitations, all administrators together. */
	maxActive: number;
	/** Invitations created within the last 24 hours, whatever happened to them since. */
	maxPerDay: number;
};

export type AppInvitationCreation = { kind: 'active-limit' } | { kind: 'created' } | { kind: 'daily-limit' };

export type AppInvitationListRecord = {
	acceptedAt: Date | null;
	acceptedByDisplayName: string | null;
	acceptedByTelegramUsername: string | null;
	createdAt: Date;
	expiresAt: Date;
	id: string;
	note: string | null;
};

/** The answer of a lookup by token hash: an active invitation, or the reason why the hash opens nothing. */
export type AppInvitationPreviewLookup =
	| { kind: 'active'; record: { expiresAt: Date; inviterName: string } }
	| { kind: 'unavailable'; reason: HouseholdInvitationUnavailableReason };

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** At most this many rows in the administrator's list. */
const LIST_LIMIT = 100;

/** Not accepted, not revoked and not expired at `now`: the only state in which an invitation does anything. */
function isActive(now: Date) {
	return and(isNull(appInvitations.acceptedAt), isNull(appInvitations.revokedAt), gt(appInvitations.expiresAt, now));
}

/**
 * Invitations into the application (`app_invitations`). Every state change is one conditional statement that repeats
 * the rules: creation counts the limits inside its transaction, revocation changes an invitation only while it is
 * active (`changes === 1`). Consumption is not here: it belongs to the sign-up transaction
 * (`reserveRegistrationInvitation`).
 */
export class AppInvitationRepository {
	public constructor(private readonly database: AppDatabase) {}

	/** Inserts the invitation unless a limit is reached; the count and the insert are one transaction. */
	public create(invitation: NewAppInvitation, limits: AppInvitationLimits): AppInvitationCreation {
		return this.database.transaction((transaction): AppInvitationCreation => {
			const [{ active }] = transaction.select({ active: sql<number>`count(*)` })
				.from(appInvitations)
				.where(isActive(invitation.createdAt))
				.all();

			if (active >= limits.maxActive) {
				return { kind: 'active-limit' };
			}

			const [{ recent }] = transaction.select({ recent: sql<number>`count(*)` })
				.from(appInvitations)
				.where(gt(appInvitations.createdAt, new Date(invitation.createdAt.getTime() - DAY_MILLISECONDS)))
				.all();

			if (recent >= limits.maxPerDay) {
				return { kind: 'daily-limit' };
			}

			transaction.insert(appInvitations).values(invitation).run();

			return { kind: 'created' };
		});
	}

	/** Active invitations and the ones accepted after `acceptedSince`, newest first; never a token or a hash. */
	public async list(now: Date, acceptedSince: Date): Promise<AppInvitationListRecord[]> {
		const acceptedBy = alias(users, 'accepted_by');

		return this.database.select({
			acceptedAt: appInvitations.acceptedAt,
			acceptedByDisplayName: acceptedBy.displayName,
			acceptedByTelegramUsername: telegramAccounts.username,
			createdAt: appInvitations.createdAt,
			expiresAt: appInvitations.expiresAt,
			id: appInvitations.id,
			note: appInvitations.note
		})
			.from(appInvitations)
			.leftJoin(acceptedBy, eq(appInvitations.acceptedByUserId, acceptedBy.id))
			.leftJoin(telegramAccounts, eq(telegramAccounts.userId, acceptedBy.id))
			.where(or(
				isActive(now),
				and(isNotNull(appInvitations.acceptedAt), gt(appInvitations.acceptedAt, acceptedSince))
			))
			.orderBy(desc(appInvitations.createdAt), desc(appInvitations.id))
			.limit(LIST_LIMIT);
	}

	/** Revokes an active invitation. `false` for an unknown id and for one no longer active alike. */
	public revoke(invitationId: string, now: Date): boolean {
		return this.database.update(appInvitations)
			.set({ revokedAt: now })
			.where(and(eq(appInvitations.id, invitationId), isActive(now)))
			.run().changes === 1;
	}

	/**
	 * The inviter's name and the deadline of an active invitation, or the reason why the hash opens nothing. One query
	 * whatever the token, like the household lookup it runs next to (Р5): an unknown hash and a dead invitation cost
	 * the same. The caller has already checked that the token is well-formed.
	 */
	public async findPreview(tokenHash: string, now: Date): Promise<AppInvitationPreviewLookup> {
		const row = this.database.select({
			acceptedAt: appInvitations.acceptedAt,
			expiresAt: appInvitations.expiresAt,
			inviterName: users.displayName,
			revokedAt: appInvitations.revokedAt
		})
			.from(appInvitations)
			.innerJoin(users, eq(appInvitations.createdByUserId, users.id))
			.where(eq(appInvitations.tokenHash, tokenHash))
			.get();

		if (row === undefined) {
			return { kind: 'unavailable', reason: 'unknown' };
		}

		const reason = invitationUnavailableReason(row, now);

		return reason === undefined
			? { kind: 'active', record: { expiresAt: row.expiresAt, inviterName: row.inviterName } }
			: { kind: 'unavailable', reason };
	}
}
