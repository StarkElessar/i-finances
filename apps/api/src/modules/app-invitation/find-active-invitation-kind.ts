import type { AppDatabase, AppTransaction } from '@/infrastructure/database/client';
import { appInvitations, householdInvitations } from '@/infrastructure/database/schema';

import type { InvitationKind } from '@i-finances/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';

/**
 * Which invitation, if any, lets the holder of this token hash sign up while registration is closed
 * (`app-invitations-v1.md`):
 *
 * - `app`: an invitation into the application, not accepted, not revoked, not expired;
 * - `household`: an invitation into a household, not accepted, not revoked, not expired, and not yet used for a
 *   sign-up (`registered_user_id IS NULL`: one new account per household link);
 * - `undefined`: nothing, whatever the reason.
 *
 * Both tables are always asked, one query each, so the work does not depend on the answer. Runs on the database
 * (`start`, the bot) or inside the transaction that creates the user (`complete`), where it decides.
 */
export function findActiveInvitationKind(
	executor: AppDatabase | AppTransaction,
	tokenHash: string,
	now: Date
): InvitationKind | undefined {
	const app = executor.select({ id: appInvitations.id })
		.from(appInvitations)
		.where(and(
			eq(appInvitations.tokenHash, tokenHash),
			isNull(appInvitations.acceptedAt),
			isNull(appInvitations.revokedAt),
			gt(appInvitations.expiresAt, now)
		))
		.get();
	const household = executor.select({ id: householdInvitations.id })
		.from(householdInvitations)
		.where(and(
			eq(householdInvitations.tokenHash, tokenHash),
			isNull(householdInvitations.acceptedAt),
			isNull(householdInvitations.revokedAt),
			isNull(householdInvitations.registeredUserId),
			gt(householdInvitations.expiresAt, now)
		))
		.get();

	if (app !== undefined) {
		return 'app';
	}

	return household === undefined ? undefined : 'household';
}
