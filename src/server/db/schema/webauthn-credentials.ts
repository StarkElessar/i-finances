import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * Stores public WebAuthn credentials registered by authenticated users.
 */
export const webauthnCredentials = sqliteTable(
	'webauthn_credentials',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		publicKey: text('public_key').notNull(),
		counter: integer('counter').notNull().default(0),
		transports: text('transports', { mode: 'json' }).$type<string[]>(),
		deviceType: text('device_type').notNull(),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
		deviceName: text('device_name'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('webauthn_credentials_user_id_idx').on(table.userId)
	]
);

/**
 * Database row returned for a WebAuthn credential.
 */
export type WebauthnCredentialRecord = typeof webauthnCredentials.$inferSelect;

/**
 * Values accepted when storing a WebAuthn credential.
 */
export type NewWebauthnCredentialRecord = typeof webauthnCredentials.$inferInsert;
