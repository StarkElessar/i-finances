import type { Accessor } from 'solid-js';
import { createSignal, onCleanup, onMount } from 'solid-js';

import type { TelegramRequestFlow, TelegramRequestFlowOptions } from './telegram-request-flow';
import type { TelegramRequestState } from './telegram-request-state';

export type TelegramRequest<TConfirmed extends object, TReason extends string> = {
	cancel: () => void;
	openTelegram: () => void;
	start: () => void;
	state: Accessor<TelegramRequestState<TConfirmed, TReason>>;
};

/** What a flow needs from the page: whether it is visible and where the states go. */
export type TelegramRequestPageOptions<TConfirmed extends object, TReason extends string> = Pick<
	TelegramRequestFlowOptions<TConfirmed, TReason>,
	'isPageVisible' | 'onChange'
>;

/**
 * Binds a Telegram request flow to the component that owns it: optional `start` on mount, polling resumed on
 * `visibilitychange`, everything stopped on cleanup (leaving the page or closing the dialog).
 */
export function createTelegramRequest<TConfirmed extends object, TReason extends string>(
	createFlow: (page: TelegramRequestPageOptions<TConfirmed, TReason>) => TelegramRequestFlow<TConfirmed, TReason>,
	options: { startOnMount?: boolean } = {}
): TelegramRequest<TConfirmed, TReason> {
	const [state, setState] = createSignal<TelegramRequestState<TConfirmed, TReason>>({ kind: 'idle' });
	const flow = createFlow({
		isPageVisible: () => document.visibilityState === 'visible',
		onChange: setState
	});

	const handleVisibilityChange = (): void => {
		flow.handleVisibilityChange();
	};

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		if (options.startOnMount ?? true) {
			flow.start();
		}
	});
	onCleanup(() => {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		flow.dispose();
	});

	return {
		cancel: () => flow.cancel(),
		openTelegram: () => flow.handleLinkOpened(),
		start: () => flow.start(),
		state
	};
}
