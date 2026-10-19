import type { AppDatabase, AppTransaction } from '@/infrastructure/database/client';
import {
	householdInvitations,
	householdMembers,
	households,
	users
} from '@/infrastructure/database/schema';

import type { HouseholdInvitationUnavailableReason } from '@i-finances/contracts';
import { and, asc, eq, exists, gt, isNull, ne, notExists, sql, TransactionRollbackError } from 'drizzle-orm';

import { householdHasData, householdHasNoDataConditions } from './household-data-references';
import { isUniqueConstraintError } from './is-unique-constraint-error';

export type NewHouseholdInvitation = {
	createdAt: Date;
	createdByUserId: string;
	expiresAt: Date;
	householdId: string;
	id: string;
	/** SHA-256 hex of the token; the token itself never reaches the repository. */
	tokenHash: string;
};

export type HouseholdInvitationLimits = {
	/** Active (not accepted, not revoked, not expired) invitations per household. */
	maxActive: number;
	/** Invitations created per household within the last 24 hours, whatever happened to them since (Р11). */
	maxPerDay: number;
};

export type HouseholdInvitationCreation =
	| { kind: 'created' }
	/** The creator is not (or no longer) an owner of the household: nothing was written. */
	| { kind: 'owner-required' }
	| { kind: 'active-limit' }
	| { kind: 'daily-limit' };

export type ActiveHouseholdInvitationRecord = {
	createdAt: Date;
	createdByDisplayName: string;
	expiresAt: Date;
	id: string;
};

export type HouseholdInvitationPreviewRecord = {
	expiresAt: Date;
	householdName: string;
	inviterName: string;
};

/** The answer of a lookup by token hash: an active invitation, or the reason why the hash opens nothing. */
export type HouseholdInvitationPreviewLookup =
	| { kind: 'active'; record: HouseholdInvitationPreviewRecord }
	| { kind: 'unavailable'; reason: HouseholdInvitationUnavailableReason };

export type AcceptHouseholdInvitationInput = {
	now: Date;
	/** Whether the caller agreed to lose their own empty household (Р5). */
	replaceEmptyHousehold: boolean;
	tokenHash: string;
	userId: string;
};

export type HouseholdInvitationAcceptance =
	| {
		householdId: string;
		householdName: string;
		/** `household_invitations.created_by_user_id`: whom the notice about the new member goes to. */
		inviterUserId: string;
		kind: 'joined';
		/** The new member's `users.display_name`, for the notice. */
		memberDisplayName: string;
		replacedHouseholdId: string | null;
	}
	/** Unknown, expired, used or revoked: one answer in one shape, told apart by `reason` only; nothing changed. */
	| { kind: 'unavailable'; reason: HouseholdInvitationUnavailableReason }
	/** The caller is already a member of the invited household, or of another one with data or other members. */
	| { currentHouseholdName: string; kind: 'already-in-household' }
	/** The caller is the only member of an empty household and has not agreed to lose it yet. */
	| { currentHouseholdName: string; kind: 'confirmation-required' };

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Not accepted, not revoked and not expired at `now`: the only state in which an invitation does anything. */
function isActive(now: Date) {
	return and(
		isNull(householdInvitations.acceptedAt),
		isNull(householdInvitations.revokedAt),
		gt(householdInvitations.expiresAt, now)
	);
}

/**
 * Why an invitation found by its hash is not active at `now`. An accepted one is `used`, a revoked one `revoked`; both
 * win over `expired`, which is what is left. An invitation cannot be both accepted and revoked: each statement needs
 * it active.
 */
function unavailableReason(
	invitation: { acceptedAt: Date | null; revokedAt: Date | null },
	expiresAt: Date,
	now: Date
): HouseholdInvitationUnavailableReason | undefined {
	if (invitation.acceptedAt !== null) {
		return 'used';
	}

	if (invitation.revokedAt !== null) {
		return 'revoked';
	}

	return expiresAt.getTime() > now.getTime() ? undefined : 'expired';
}

/** The user is an owner of the household right now, as a condition of the statement itself. */
function isOwnerOf(transaction: AppDatabase | AppTransaction, householdId: string, userId: string) {
	return exists(transaction.select({ one: sql`1` })
		.from(householdMembers)
		.where(and(
			eq(householdMembers.householdId, householdId),
			eq(householdMembers.userId, userId),
			eq(householdMembers.role, 'owner')
		)));
}

/**
 * Household invitations (Р5). Every state change is one conditional statement whose conditions repeat the rules, so a
 * rule checked earlier by the service cannot be bypassed by a parallel request: creation counts the limits inside its
 * transaction, revocation and acceptance only change an invitation that is active at that moment (`changes === 1`).
 */
export class HouseholdInvitationRepository {
	public constructor(private readonly database: AppDatabase) {}

	/**
	 * Inserts the invitation unless the creator is no longer an owner or a limit is reached; the check and the insert
	 * are one transaction, so parallel requests cannot go past the limit together.
	 */
	public create(invitation: NewHouseholdInvitation, limits: HouseholdInvitationLimits): HouseholdInvitationCreation {
		return this.database.transaction((transaction): HouseholdInvitationCreation => {
			const owner = transaction.select({ one: sql`1` })
				.from(householdMembers)
				.where(and(
					eq(householdMembers.householdId, invitation.householdId),
					eq(householdMembers.userId, invitation.createdByUserId),
					eq(householdMembers.role, 'owner')
				))
				.get();

			if (owner === undefined) {
				return { kind: 'owner-required' };
			}

			const [{ active }] = transaction.select({ active: sql<number>`count(*)` })
				.from(householdInvitations)
				.where(and(eq(householdInvitations.householdId, invitation.householdId), isActive(invitation.createdAt)))
				.all();

			if (active >= limits.maxActive) {
				return { kind: 'active-limit' };
			}

			const [{ recent }] = transaction.select({ recent: sql<number>`count(*)` })
				.from(householdInvitations)
				.where(and(
					eq(householdInvitations.householdId, invitation.householdId),
					gt(householdInvitations.createdAt, new Date(invitation.createdAt.getTime() - DAY_MILLISECONDS))
				))
				.all();

			if (recent >= limits.maxPerDay) {
				return { kind: 'daily-limit' };
			}

			transaction.insert(householdInvitations).values(invitation).run();

			return { kind: 'created' };
		});
	}

	public async listActive(householdId: string, now: Date): Promise<ActiveHouseholdInvitationRecord[]> {
		return this.database.select({
			createdAt: householdInvitations.createdAt,
			createdByDisplayName: users.displayName,
			expiresAt: householdInvitations.expiresAt,
			id: householdInvitations.id
		})
			.from(householdInvitations)
			.innerJoin(users, eq(householdInvitations.createdByUserId, users.id))
			.where(and(eq(householdInvitations.householdId, householdId), isActive(now)))
			.orderBy(asc(householdInvitations.createdAt), asc(householdInvitations.id));
	}

	/**
	 * Revokes an active invitation of the household, only while `ownerUserId` is its owner. `false` for an unknown id,
	 * an invitation of another household and one that is no longer active alike.
	 */
	public revoke(householdId: string, invitationId: string, ownerUserId: string, now: Date): boolean {
		const revoked = this.database.update(householdInvitations)
			.set({ revokedAt: now })
			.where(and(
				eq(householdInvitations.id, invitationId),
				eq(householdInvitations.householdId, householdId),
				isActive(now),
				isOwnerOf(this.database, householdId, ownerUserId)
			))
			.run();

		return revoked.changes === 1;
	}

	/**
	 * The two names and the deadline of an active invitation, or the reason why the hash opens nothing. One query
	 * whatever the token: an unknown hash and a dead invitation cost the same, and `unknown` is only the absence of a
	 * row. The caller has already checked that the token is well-formed.
	 */
	public async findPreview(tokenHash: string, now: Date): Promise<HouseholdInvitationPreviewLookup> {
		const rows = await this.database.select({
			acceptedAt: householdInvitations.acceptedAt,
			expiresAt: householdInvitations.expiresAt,
			householdName: households.name,
			inviterName: users.displayName,
			revokedAt: householdInvitations.revokedAt
		})
			.from(householdInvitations)
			.innerJoin(households, eq(householdInvitations.householdId, households.id))
			.innerJoin(users, eq(householdInvitations.createdByUserId, users.id))
			.where(eq(householdInvitations.tokenHash, tokenHash))
			.limit(1);
		const row = rows.at(0);

		if (row === undefined) {
			return { kind: 'unavailable', reason: 'unknown' };
		}

		const reason = unavailableReason(row, row.expiresAt, now);

		if (reason !== undefined) {
			return { kind: 'unavailable', reason };
		}

		return {
			kind: 'active',
			record: { expiresAt: row.expiresAt, householdName: row.householdName, inviterName: row.inviterName }
		};
	}

	/**
	 * Accepts an invitation in one transaction (Р5):
	 *
	 * 1. the invitation must be active; otherwise `unavailable` with the reason (`unknown` for a hash nobody has, `used`
	 *    for the loser of step 3);
	 * 2. a caller who already belongs to a household: the invited one, or another one with data or with other
	 *    members, gets `already-in-household`; the only member of an empty household gets `confirmation-required`
	 *    unless they agreed, and then loses that household;
	 * 3. `UPDATE ... WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?` must change exactly
	 *    one row: of two parallel acceptances of one token only one gets past it;
	 * 4. the empty household is deleted by statements that repeat the rules as their conditions;
	 * 5. the membership `member` is inserted; the unique index on `household_members.user_id` stops a membership the
	 *    caller got in parallel.
	 *
	 * Any refusal after the first change rolls everything back, the invitation included.
	 */
	public accept(input: AcceptHouseholdInvitationInput): HouseholdInvitationAcceptance {
		let refusal: HouseholdInvitationAcceptance = { kind: 'unavailable', reason: 'used' };

		try {
			return this.database.transaction((transaction): HouseholdInvitationAcceptance => {
				const invitation = transaction.select({
					acceptedAt: householdInvitations.acceptedAt,
					createdByUserId: householdInvitations.createdByUserId,
					expiresAt: householdInvitations.expiresAt,
					householdId: householdInvitations.householdId,
					householdName: households.name,
					id: householdInvitations.id,
					revokedAt: householdInvitations.revokedAt
				})
					.from(householdInvitations)
					.innerJoin(households, eq(householdInvitations.householdId, households.id))
					.where(eq(householdInvitations.tokenHash, input.tokenHash))
					.get();

				if (invitation === undefined) {
					return { kind: 'unavailable', reason: 'unknown' };
				}

				const reason = unavailableReason(invitation, invitation.expiresAt, input.now);

				if (reason !== undefined) {
					return { kind: 'unavailable', reason };
				}

				const current = transaction.select({ householdId: householdMembers.householdId, name: households.name })
					.from(householdMembers)
					.innerJoin(households, eq(householdMembers.householdId, households.id))
					.where(eq(householdMembers.userId, input.userId))
					.get();

				if (current !== undefined) {
					const isInvitedHousehold = current.householdId === invitation.householdId;

					if (isInvitedHousehold || !this.isReplaceable(transaction, current.householdId, input.userId)) {
						return { currentHouseholdName: current.name, kind: 'already-in-household' };
					}

					if (!input.replaceEmptyHousehold) {
						return { currentHouseholdName: current.name, kind: 'confirmation-required' };
					}
				}

				const consumed = transaction.update(householdInvitations)
					.set({ acceptedAt: input.now, acceptedByUserId: input.userId })
					.where(and(eq(householdInvitations.id, invitation.id), isActive(input.now)))
					.run();

				if (consumed.changes !== 1) {
					// Another acceptance got there first: the loser of the race is told `used`.
					refusal = { kind: 'unavailable', reason: 'used' };
					transaction.rollback();
				}

				if (current !== undefined) {
					refusal = { currentHouseholdName: current.name, kind: 'already-in-household' };
					this.deleteEmptyHousehold(transaction, current.householdId, input.userId);
				}

				transaction.insert(householdMembers)
					.values({ householdId: invitation.householdId, joinedAt: input.now, role: 'member', userId: input.userId })
					.run();

				const member = transaction.select({ displayName: users.displayName })
					.from(users)
					.where(eq(users.id, input.userId))
					.get();

				return {
					householdId: invitation.householdId,
					householdName: invitation.householdName,
					inviterUserId: invitation.createdByUserId,
					kind: 'joined',
					memberDisplayName: member?.displayName ?? '',
					replacedHouseholdId: current?.householdId ?? null
				};
			});
		}
		catch (error: unknown) {
			if (error instanceof TransactionRollbackError) {
				return refusal;
			}

			// A membership the caller got in parallel (created a household, accepted another invitation): rolled back.
			if (isUniqueConstraintError(error)) {
				return { currentHouseholdName: this.findHouseholdName(input.userId) ?? '', kind: 'already-in-household' };
			}

			throw error;
		}
	}

	private findHouseholdName(userId: string): string | undefined {
		return this.database.select({ name: households.name })
			.from(householdMembers)
			.innerJoin(households, eq(householdMembers.householdId, households.id))
			.where(eq(householdMembers.userId, userId))
			.get()?.name;
	}

	/** The caller is the only member of the household, and the household has no data (Р5). */
	private isReplaceable(transaction: AppTransaction, householdId: string, userId: string): boolean {
		const otherMember = transaction.select({ one: sql`1` })
			.from(householdMembers)
			.where(and(eq(householdMembers.householdId, householdId), ne(householdMembers.userId, userId)))
			.limit(1)
			.get();

		return otherMember === undefined && !householdHasData(transaction, householdId);
	}

	/**
	 * Deletes the caller's membership and their empty household, each statement only under the rules of Р5 (alone in
	 * it, no data) and each required to change exactly one row; otherwise the whole acceptance is rolled back. Nothing
	 * with data is deleted even if a check above were missed. The household's own invitations go with it (cascade).
	 */
	private deleteEmptyHousehold(transaction: AppTransaction, householdId: string, userId: string): void {
		const left = transaction.delete(householdMembers)
			.where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
			.run();

		if (left.changes !== 1) {
			transaction.rollback();
		}

		const deleted = transaction.delete(households)
			.where(and(
				eq(households.id, householdId),
				notExists(transaction.select({ one: sql`1` }).from(householdMembers).where(eq(householdMembers.householdId, householdId))),
				...householdHasNoDataConditions(transaction, householdId)
			))
			.run();

		if (deleted.changes !== 1) {
			transaction.rollback();
		}
	}
}
