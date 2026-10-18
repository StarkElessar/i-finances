import type { AppDatabase, AppTransaction } from '@/infrastructure/database/client';
import { householdInvitations, householdMembers } from '@/infrastructure/database/schema';
import type { SessionRepository } from '@/modules/auth';

import { and, eq, exists, gt, isNull, ne, or, sql } from 'drizzle-orm';

export type RemoveHouseholdMemberInput = {
	householdId: string;
	memberUserId: string;
	now: Date;
	/** The owner who removes; must be an owner of the household at the moment of the statement. */
	ownerUserId: string;
};

export type HouseholdMemberRemoval =
	| { endedSessions: number; kind: 'removed' }
	/** Not a member of this household, the owner themselves, or the remover is no longer an owner: nothing changed. */
	| { kind: 'not-removed' };

export type LeaveHouseholdInput = {
	householdId: string;
	now: Date;
	userId: string;
};

export type HouseholdLeaving =
	| { kind: 'left' }
	/** The last owner (or no longer a member): nothing changed. */
	| { kind: 'not-left' };

/**
 * Removing a member and leaving a household (Р6, Р7). The invariant «a household always has an owner» is a condition of
 * the deleting statement itself, not a check before it, so two owners removing each other or leaving together cannot
 * both succeed. The user row is never deleted (their operations keep their author).
 */
export class HouseholdMembershipRepository {
	public constructor(
		private readonly database: AppDatabase,
		private readonly sessions: Pick<SessionRepository, 'deleteByUserId'>
	) {}

	/**
	 * In one transaction: deletes the membership of `memberUserId` in the household (only while `ownerUserId` is its
	 * owner and is not the one removed), revokes the invitations the removed user created there, and ends **all**
	 * sessions of the removed user (Р7).
	 */
	public removeMember(input: RemoveHouseholdMemberInput): HouseholdMemberRemoval {
		return this.database.transaction((transaction): HouseholdMemberRemoval => {
			const removed = transaction.delete(householdMembers)
				.where(and(
					eq(householdMembers.householdId, input.householdId),
					eq(householdMembers.userId, input.memberUserId),
					ne(householdMembers.userId, input.ownerUserId),
					exists(transaction.select({ one: sql`1` })
						.from(householdMembers)
						.where(and(
							eq(householdMembers.householdId, input.householdId),
							eq(householdMembers.userId, input.ownerUserId),
							eq(householdMembers.role, 'owner')
						)))
				))
				.run();

			if (removed.changes !== 1) {
				return { kind: 'not-removed' };
			}

			this.revokeInvitationsCreatedBy(transaction, input.householdId, input.memberUserId, input.now);

			return { endedSessions: this.sessions.deleteByUserId(input.memberUserId, transaction), kind: 'removed' };
		});
	}

	/**
	 * Deletes the caller's own membership: a member always may, an owner only while another owner remains. The sessions
	 * stay (flow 5.5): the person is in onboarding afterwards.
	 */
	public leave(input: LeaveHouseholdInput): HouseholdLeaving {
		return this.database.transaction((transaction): HouseholdLeaving => {
			const left = transaction.delete(householdMembers)
				.where(and(
					eq(householdMembers.householdId, input.householdId),
					eq(householdMembers.userId, input.userId),
					or(
						eq(householdMembers.role, 'member'),
						exists(transaction.select({ one: sql`1` })
							.from(householdMembers)
							.where(and(
								eq(householdMembers.householdId, input.householdId),
								eq(householdMembers.role, 'owner'),
								ne(householdMembers.userId, input.userId)
							)))
					)
				))
				.run();

			if (left.changes !== 1) {
				return { kind: 'not-left' };
			}

			this.revokeInvitationsCreatedBy(transaction, input.householdId, input.userId, input.now);

			return { kind: 'left' };
		});
	}

	/**
	 * A person who is no longer in the household must not be able to come back with a link they created themselves
	 * while they were an owner there.
	 */
	private revokeInvitationsCreatedBy(transaction: AppTransaction, householdId: string, userId: string, now: Date): void {
		transaction.update(householdInvitations)
			.set({ revokedAt: now })
			.where(and(
				eq(householdInvitations.householdId, householdId),
				eq(householdInvitations.createdByUserId, userId),
				isNull(householdInvitations.acceptedAt),
				isNull(householdInvitations.revokedAt),
				gt(householdInvitations.expiresAt, now)
			))
			.run();
	}
}
