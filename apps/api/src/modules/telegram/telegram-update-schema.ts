import { z } from 'zod';

/** Telegram identifiers fit into 52 bits, so a JS number is exact; they are stored as strings by the callers. */
const telegramIdSchema = z.number().int();

export const telegramUserSchema = z.object({
	first_name: z.string(),
	id: telegramIdSchema,
	is_bot: z.boolean(),
	last_name: z.string().optional(),
	username: z.string().optional()
});

export const telegramChatSchema = z.object({
	id: telegramIdSchema,
	type: z.string()
});

export const telegramMessageSchema = z.object({
	chat: telegramChatSchema,
	date: z.number().int(),
	from: telegramUserSchema.optional(),
	message_id: z.number().int(),
	text: z.string().optional()
});

export const telegramCallbackQuerySchema = z.object({
	data: z.string().optional(),
	from: telegramUserSchema,
	id: z.string(),
	// Absent when the message is too old; a handler must cope with that.
	message: z.object({
		chat: telegramChatSchema,
		message_id: z.number().int()
	}).optional()
});

/**
 * One Bot API `Update`, reduced to what the bot reads. Fields that are not listed are dropped by the parser.
 *
 * `message` and `callback_query` fall back to `undefined` when their own shape is wrong: one malformed payload must
 * not make `getUpdates` return the same poisoned batch forever. A handler therefore only ever sees a fully valid
 * message or callback query, and an update with neither is ignored by the dispatcher.
 */
export const telegramUpdateSchema = z.object({
	callback_query: telegramCallbackQuerySchema.optional().catch(undefined),
	message: telegramMessageSchema.optional().catch(undefined),
	update_id: z.number().int().nonnegative()
});

export type TelegramUser = z.infer<typeof telegramUserSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
