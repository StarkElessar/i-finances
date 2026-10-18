import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

/**
 * One-time invitation links into a household.
 *
 * Only the SHA-256 hash of the token is stored: the link is shown once when it
 * is created. Users are never deleted, so the user references have no cascade.
 * There is no role column: v1 invites members only.
 */
export const householdInvitations = sqliteTable(
	'household_invitations',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
		acceptedByUserId: text('accepted_by_user_id').references(() => users.id),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('household_invitations_household_id_idx').on(table.householdId)
	]
);

/**
 * Database row returned for a household invitation.
 */
export type HouseholdInvitationRecord = typeof householdInvitations.$inferSelect;

/**
 * Values accepted when creating a household invitation.
 */
export type NewHouseholdInvitationRecord = typeof householdInvitations.$inferInsert;
