import type { Accessor } from 'solid-js';
import { createSignal, onCleanup, onMount } from 'solid-js';

import { TelegramSignInFlow, type TelegramSignInGateway } from './telegram-sign-in-flow';
import type { TelegramSignInState } from './telegram-sign-in-state';

export type TelegramSignIn = {
	cancel: () => void;
	openTelegram: () => void;
	start: () => void;
	state: Accessor<TelegramSignInState>;
};

/**
 * Binds the Telegram sign-in flow to the component that owns it: one `start` on mount, polling resumed on
 * `visibilitychange`, everything stopped on cleanup (leaving the sign-in page).
 */
export function createTelegramSignIn(gateway: TelegramSignInGateway): TelegramSignIn {
	const [state, setState] = createSignal<TelegramSignInState>({ kind: 'idle' });
	const flow = new TelegramSignInFlow({
		gateway,
		isPageVisible: () => document.visibilityState === 'visible',
		onChange: setState
	});

	const handleVisibilityChange = (): void => {
		flow.handleVisibilityChange();
	};

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);
		flow.start();
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
