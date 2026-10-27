import { TelegramRequestFlow, type TelegramRequestFlowOptions } from '@/features/telegram-request';

import { createTelegramSignInProtocol, type TelegramSignInGateway } from './telegram-sign-in-protocol';
import type { TelegramSignInConfirmed, TelegramSignInFailureReason } from './telegram-sign-in-state';

export type { TelegramSignInGateway } from './telegram-sign-in-protocol';

export type TelegramSignInFlowOptions = {
	gateway: TelegramSignInGateway;
	invitationToken?: string;
	/** `document.visibilityState === 'visible'`; polling pauses while the page is hidden. */
	isPageVisible: () => boolean;
	onChange: TelegramRequestFlowOptions<TelegramSignInConfirmed, TelegramSignInFailureReason>['onChange'];
};

/**
 * The browser side of the Telegram sign-in (flow 5.1): the shared Telegram request flow (see `TelegramRequestFlow` for
 * its guarantees) with the sign-in requests.
 */
export class TelegramSignInFlow extends TelegramRequestFlow<TelegramSignInConfirmed, TelegramSignInFailureReason> {
	public constructor(options: TelegramSignInFlowOptions) {
		super({
			isPageVisible: options.isPageVisible,
			onChange: options.onChange,
			protocol: createTelegramSignInProtocol(options.gateway, options.invitationToken)
		});
	}
}
