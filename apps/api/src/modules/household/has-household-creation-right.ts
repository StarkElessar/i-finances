import type { AppDatabase, AppTransaction } from '@/infrastructure/database/client';
import { appInvitations, householdMembers, users } from '@/infrastructure/database/schema';

import { and, eq, exists, isNotNull, or, sql } from 'drizzle-orm';

/**
 * Whether the stored data lets the user found a household (`app-invitations-v1.md`, section 13). The platform
 * administrator is the other ground; it comes from the environment, not from the database (`HouseholdCreationPolicy`).
 *
 * Any of, in one query:
 *
 * - the user signed up with an invitation into the application (`app_invitations.accepted_by_user_id`);
 * - the user has been an owner of a household at some time (`users.first_household_owner_at`);
 * - the user is an owner right now (a membership with the role `owner`), so an owner whose time was never written down
 *   (a direct insert, a run of older code after a rollback) is not refused while the membership lasts.
 *
 * Nothing else counts: a sign-up through a household invitation, having accepted one, or having been a member never
 * does, whether or not the person is still in that household. Every ground only grows (nothing clears it), so the
 * answer for a user never turns from yes to no. Runs on the database (the session) or inside the transaction that
 * creates the household, where it decides.
 */
export function hasHouseholdCreationRight(executor: AppDatabase | AppTransaction, userId: string): boolean {
	const one = sql`1`;
	const row = executor.select({ one })
		.from(users)
		.where(and(
			eq(users.id, userId),
			or(
				isNotNull(users.firstHouseholdOwnerAt),
				exists(executor.select({ one })
					.from(appInvitations)
					.where(eq(appInvitations.acceptedByUserId, users.id))),
				exists(executor.select({ one })
					.from(householdMembers)
					.where(and(eq(householdMembers.userId, users.id), eq(householdMembers.role, 'owner'))))
			)
		))
		.get();

	return row !== undefined;
}
