import { createTelegramRequest, type TelegramRequest } from '@/features/telegram-request';

import { TelegramLinkFlow } from './telegram-link-flow';
import type { TelegramLinkGateway } from './telegram-link-protocol';
import type { TelegramLinkConfirmed, TelegramLinkFailureReason } from './telegram-link-state';

export type TelegramLink = TelegramRequest<TelegramLinkConfirmed, TelegramLinkFailureReason>;

/**
 * Binds the Telegram link flow to its block: `start` only on the person's press, polling resumed on `visibilitychange`,
 * everything stopped when the block goes away (the dialog is closed).
 */
export function createTelegramLink(gateway: TelegramLinkGateway, userId: string): TelegramLink {
	return createTelegramRequest((page) => new TelegramLinkFlow({ gateway, userId, ...page }), { startOnMount: false });
}
