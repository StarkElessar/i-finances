import { createTelegramRequest, type TelegramRequest } from '@/features/telegram-request';

import { TelegramSignInFlow } from './telegram-sign-in-flow';
import type { TelegramSignInGateway } from './telegram-sign-in-protocol';
import type { TelegramSignInConfirmed, TelegramSignInFailureReason } from './telegram-sign-in-state';

export type TelegramSignIn = TelegramRequest<TelegramSignInConfirmed, TelegramSignInFailureReason>;

/**
 * Binds the Telegram sign-in flow to the component that owns it: one `start` on mount, polling resumed on
 * `visibilitychange`, everything stopped on cleanup (leaving the sign-in page).
 */
export function createTelegramSignIn(gateway: TelegramSignInGateway): TelegramSignIn {
	return createTelegramRequest((page) => new TelegramSignInFlow({ gateway, ...page }));
}
