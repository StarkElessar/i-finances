import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * Links one user to exactly one Telegram account (one person, one Telegram).
 *
 * The primary key on `user_id` and the unique `telegram_id` together keep the
 * link one-to-one. Telegram ids are stored as text: they are identifiers, not
 * numbers, and must not lose precision in JSON or logs.
 */
export const telegramAccounts = sqliteTable('telegram_accounts', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	telegramId: text('telegram_id').notNull().unique(),
	username: text('username'),
	firstName: text('first_name').notNull(),
	lastName: text('last_name'),
	/** Private chat with the bot, used for notifications. */
	chatId: text('chat_id').notNull(),
	/** Set when `sendMessage` answers 403 because the user blocked the bot. */
	botBlockedAt: integer('bot_blocked_at', { mode: 'timestamp_ms' }),
	linkedAt: integer('linked_at', { mode: 'timestamp_ms' }).notNull(),
	lastSignInAt: integer('last_sign_in_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/**
 * Database row returned for a linked Telegram account.
 */
export type TelegramAccountRecord = typeof telegramAccounts.$inferSelect;

/**
 * Values accepted when linking a Telegram account.
 */
export type NewTelegramAccountRecord = typeof telegramAccounts.$inferInsert;
