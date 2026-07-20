import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Stores family members that may authenticate with a password or passkey.
 */
export const users = sqliteTable(
    'users',
    {
        id: text('id').primaryKey(),
        username: text('username').notNull(),
        displayName: text('display_name').notNull(),
        passwordHash: text('password_hash').notNull(),
        isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        uniqueIndex('users_username_unique').on(table.username)
    ]
);

/**
 * Database row returned for a persisted user.
 */
export type UserRecord = typeof users.$inferSelect;

/**
 * Values accepted when creating a user.
 */
export type NewUserRecord = typeof users.$inferInsert;
