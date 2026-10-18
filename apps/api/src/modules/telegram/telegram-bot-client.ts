import type { TelegramUpdate } from './telegram-update-schema';

/** Telegram chat and message ids are 52-bit integers; callers keep them as strings in the database. */
export type TelegramChatId = number | string;

export type TelegramInlineButton = {
	/** Up to 64 bytes; what the bot gets back in `callback_query.data`. */
	callbackData?: string;
	text: string;
	url?: string;
};

/** Rows of buttons under a message. */
export type TelegramInlineKeyboard = TelegramInlineButton[][];

export type SendMessageInput = {
	chatId: TelegramChatId;
	/** Plain text: no `parse_mode` is ever set, so names coming from Telegram cannot inject markup. */
	text: string;
	keyboard?: TelegramInlineKeyboard;
};

export type EditMessageTextInput = {
	chatId: TelegramChatId;
	messageId: number;
	text: string;
	/** Buttons that are not passed again disappear from the message. */
	keyboard?: TelegramInlineKeyboard;
};

export type AnswerCallbackQueryInput = {
	callbackQueryId: string;
	text?: string;
};

export type SetWebhookInput = {
	secretToken: string;
	url: string;
};

export type GetUpdatesInput = {
	offset: number;
	/** Aborts the long poll, for example at shutdown. */
	signal?: AbortSignal;
	/** Long poll duration on Telegram's side; 0 returns at once. */
	timeoutSeconds: number;
};

/**
 * The part of the Bot API this application uses. Implementations throw `TelegramForbiddenError` (403),
 * `TelegramRateLimitedError` (429), `TelegramApiError` (any other `ok: false`), `TelegramTimeoutError` and
 * `TelegramNetworkError`. Tests substitute `FakeTelegramBotClient`; the real one never runs in tests.
 */
export type TelegramBotClient = {
	answerCallbackQuery: (input: AnswerCallbackQueryInput) => Promise<void>;
	deleteWebhook: () => Promise<void>;
	editMessageText: (input: EditMessageTextInput) => Promise<void>;
	getUpdates: (input: GetUpdatesInput) => Promise<TelegramUpdate[]>;
	sendMessage: (input: SendMessageInput) => Promise<{ messageId: number }>;
	setWebhook: (input: SetWebhookInput) => Promise<void>;
};
