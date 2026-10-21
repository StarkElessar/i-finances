import { TelegramRequestFlow, type TelegramRequestFlowOptions } from '@/features/telegram-request';

import { createTelegramLinkProtocol, type TelegramLinkGateway } from './telegram-link-protocol';
import type { TelegramLinkConfirmed, TelegramLinkFailureReason } from './telegram-link-state';

export type TelegramLinkFlowOptions = {
	gateway: TelegramLinkGateway;
	/** `document.visibilityState === 'visible'`; polling pauses while the page is hidden. */
	isPageVisible: () => boolean;
	onChange: TelegramRequestFlowOptions<TelegramLinkConfirmed, TelegramLinkFailureReason>['onChange'];
};

/**
 * The browser side of the Telegram link (flow 5.3): the shared Telegram request flow (see `TelegramRequestFlow` for its
 * guarantees) with the link requests.
 */
export class TelegramLinkFlow extends TelegramRequestFlow<TelegramLinkConfirmed, TelegramLinkFailureReason> {
	public constructor(options: TelegramLinkFlowOptions) {
		super({
			isPageVisible: options.isPageVisible,
			onChange: options.onChange,
			protocol: createTelegramLinkProtocol(options.gateway)
		});
	}
}
