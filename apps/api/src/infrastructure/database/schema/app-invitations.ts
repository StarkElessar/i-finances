import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * One-time invitations into the application itself (`development/decisions/app-invitations-v1.md`): the person who
 * holds one may sign up through Telegram while registration is closed, and starts without a household, so they found
 * their own and become its owner. Only a platform administrator (`PLATFORM_ADMIN_USERNAMES`) creates them.
 *
 * Only the SHA-256 hash of the token is stored: the link is shown once when it is created. The sign-up that uses the
 * invitation sets `accepted_at` and `accepted_by_user_id` in the transaction that creates the user. Users are never
 * deleted, so the user references have no cascade. `note` is a free text for the administrator only (who it was for),
 * never shown to the guest.
 */
export const appInvitations = sqliteTable(
	'app_invitations',
	{
		id: text('id').primaryKey(),
		tokenHash: text('token_hash').notNull().unique(),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id),
		note: text('note'),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
		acceptedByUserId: text('accepted_by_user_id').references(() => users.id),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('app_invitations_created_at_idx').on(table.createdAt)
	]
);

/**
 * Database row returned for an application invitation.
 */
export type AppInvitationRecord = typeof appInvitations.$inferSelect;

/**
 * Values accepted when creating an application invitation.
 */
export type NewAppInvitationRecord = typeof appInvitations.$inferInsert;
