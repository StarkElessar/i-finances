export const TELEGRAM_UPDATES_MODES = ['webhook', 'polling', 'off'] as const;

/** Where the bot gets its updates from: Telegram pushes them (webhook), we pull them (polling), or nobody does (off). */
export type TelegramUpdatesMode = (typeof TELEGRAM_UPDATES_MODES)[number];
