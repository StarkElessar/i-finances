import type { TelegramUpdate } from './telegram-update-schema';

/**
 * Where a verified, de-duplicated update goes. The infrastructure (webhook, polling) knows nothing about sign-in or
 * households; the sign-in service (A3) implements this port. The handler may throw: the dispatcher logs and swallows
 * it, because Telegram would otherwise redeliver the same update over and over.
 */
export type TelegramUpdateHandler = {
	handle: (update: TelegramUpdate) => Promise<void>;
};
