import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * Persists revocable opaque browser sessions by token hash.
 */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		tokenHash: text('token_hash').notNull().unique(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent')
	},
	(table) => [
		index('sessions_user_id_idx').on(table.userId),
		index('sessions_expires_at_idx').on(table.expiresAt)
	]
);

/**
 * Database row returned for a persisted session.
 */
export type SessionRecord = typeof sessions.$inferSelect;

/**
 * Values accepted when creating a session.
 */
export type NewSessionRecord = typeof sessions.$inferInsert;
