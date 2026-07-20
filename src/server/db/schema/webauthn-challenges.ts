import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * Supported one-time WebAuthn ceremony purposes.
 */
export type WebauthnChallengePurpose = 'authentication' | 'registration';

/**
 * Stores short-lived, one-time challenges for WebAuthn ceremonies.
 */
export const webauthnChallenges = sqliteTable(
    'webauthn_challenges',
    {
        id: text('id').primaryKey(),
        challenge: text('challenge').notNull().unique(),
        purpose: text('purpose').$type<WebauthnChallengePurpose>().notNull(),
        userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        index('webauthn_challenges_expires_at_idx').on(table.expiresAt),
        index('webauthn_challenges_user_id_idx').on(table.userId)
    ]
);

/**
 * Database row returned for a WebAuthn challenge.
 */
export type WebauthnChallengeRecord = typeof webauthnChallenges.$inferSelect;

/**
 * Values accepted when storing a WebAuthn challenge.
 */
export type NewWebauthnChallengeRecord = typeof webauthnChallenges.$inferInsert;
