import type { TelegramUpdateHandler } from './telegram-update-handler';
import type { TelegramUpdate } from './telegram-update-schema';

/**
 * Stand-in until the sign-in service exists (A3): accepts every update and does nothing with it.
 */
export class IgnoringTelegramUpdateHandler implements TelegramUpdateHandler {
	public handle(_update: TelegramUpdate): Promise<void> {
		return Promise.resolve();
	}
}
