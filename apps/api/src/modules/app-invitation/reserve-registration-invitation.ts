import type { AppTransaction } from '@/infrastructure/database/client';
import { appInvitations, householdInvitations } from '@/infrastructure/database/schema';

import type { InvitationKind } from '@i-finances/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';

export type ReserveRegistrationInvitationInput = {
	kind: InvitationKind;
	now: Date;
	tokenHash: string;
	/** The user the sign-up has just inserted in the same transaction. */
	userId: string;
};

/**
 * Spends the invitation on the sign-up, inside the transaction that has just inserted the user, with one conditional
 * `UPDATE` that repeats every rule of `findActiveInvitationKind` and must change exactly one row:
 *
 * - `app`: the invitation is consumed (`accepted_at`, `accepted_by_user_id`): one account per link;
 * - `household`: only its sign-up slot is taken (`registered_user_id`); the invitation stays active, joining is the
 *   ordinary `accept` after the sign-in.
 *
 * `false` means somebody got there first (two sign-ups with one link): the caller rolls the whole transaction back,
 * the user included.
 */
export function reserveRegistrationInvitation(transaction: AppTransaction, input: ReserveRegistrationInvitationInput): boolean {
	const { now, tokenHash, userId } = input;

	if (input.kind === 'app') {
		return transaction.update(appInvitations)
			.set({ acceptedAt: now, acceptedByUserId: userId })
			.where(and(
				eq(appInvitations.tokenHash, tokenHash),
				isNull(appInvitations.acceptedAt),
				isNull(appInvitations.revokedAt),
				gt(appInvitations.expiresAt, now)
			))
			.run().changes === 1;
	}

	return transaction.update(householdInvitations)
		.set({ registeredUserId: userId })
		.where(and(
			eq(householdInvitations.tokenHash, tokenHash),
			isNull(householdInvitations.acceptedAt),
			isNull(householdInvitations.revokedAt),
			isNull(householdInvitations.registeredUserId),
			gt(householdInvitations.expiresAt, now)
		))
		.run().changes === 1;
}
