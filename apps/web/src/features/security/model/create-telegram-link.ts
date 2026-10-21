import { createTelegramRequest, type TelegramRequest } from '@/features/telegram-request';

import { TelegramLinkFlow } from './telegram-link-flow';
import type { TelegramLinkGateway } from './telegram-link-protocol';
import type { TelegramLinkConfirmed, TelegramLinkFailureReason } from './telegram-link-state';

export type TelegramLink = TelegramRequest<TelegramLinkConfirmed, TelegramLinkFailureReason>;

/**
 * Binds the Telegram link flow to the block that owns it: one `start` when the block appears, polling resumed on
 * `visibilitychange`, everything stopped when the block goes away (the dialog is closed).
 */
export function createTelegramLink(gateway: TelegramLinkGateway): TelegramLink {
	return createTelegramRequest((page) => new TelegramLinkFlow({ gateway, ...page }));
}
