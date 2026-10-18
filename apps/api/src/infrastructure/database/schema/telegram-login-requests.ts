import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users';

/**
 * Why a Telegram login request was started: to sign in (or sign up) or to link Telegram to the current user.
 */
export type TelegramLoginRequestPurpose = 'link' | 'sign-in';

/**
 * Lifecycle of a request: `pending → confirmed | rejected`, then `confirmed → used`.
 * Every transition is a conditional update, so a request is consumed once.
 */
export type TelegramLoginRequestStatus = 'confirmed' | 'pending' | 'rejected' | 'used';

/**
 * Short-lived deep-link login requests confirmed by the user in the bot.
 *
 * `code` travels in the bot link; the browser that started the request holds the
 * secret in an httpOnly cookie, and only its SHA-256 hash is stored here. The
 * Telegram identity columns stay NULL until the bot confirms the request.
 */
export const telegramLoginRequests = sqliteTable(
	'telegram_login_requests',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull().unique(),
		secretHash: text('secret_hash').notNull(),
		purpose: text('purpose').$type<TelegramLoginRequestPurpose>().notNull(),
		/** Set only for `link`: the signed-in user that Telegram is being linked to. */
		linkUserId: text('link_user_id').references(() => users.id, { onDelete: 'cascade' }),
		status: text('status').$type<TelegramLoginRequestStatus>().notNull(),
		telegramId: text('telegram_id'),
		username: text('username'),
		firstName: text('first_name'),
		lastName: text('last_name'),
		chatId: text('chat_id'),
		userAgent: text('user_agent'),
		ipAddress: text('ip_address'),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('telegram_login_requests_expires_at_idx').on(table.expiresAt)
	]
);

/**
 * Database row returned for a Telegram login request.
 */
export type TelegramLoginRequestRecord = typeof telegramLoginRequests.$inferSelect;

/**
 * Values accepted when starting a Telegram login request.
 */
export type NewTelegramLoginRequestRecord = typeof telegramLoginRequests.$inferInsert;
