import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { describeSignInCard } from '../model/sign-in-card-view';
import type { TelegramSignInLink, TelegramSignInState } from '../model/telegram-sign-in-state';

import { SignInOptions } from './sign-in-options';

const LINK: TelegramSignInLink = {
	appUrl: 'tg://resolve?domain=i_finances_bot&start=example',
	botUrl: 'https://t.me/i_finances_bot?start=example',
	code: 'example',
	expiresAtMs: 0,
	ttlMinutes: 10
};

const noop = () => {};

const meta = {
	title: 'Auth/SignInOptions',
	component: SignInOptions,
	args: {
		botUrl: LINK.botUrl,
		onCancel: noop,
		onOpenTelegram: noop,
		onPasskey: noop,
		onRestart: noop,
		onUsePassword: noop,
		view: describeSignInCard({ kind: 'ready', link: LINK })
	}
} satisfies Meta<typeof SignInOptions>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Builds the args of one board state the same way the page does. */
function stateArgs(state: TelegramSignInState) {
	return { view: describeSignInCard(state) };
}

/** 1. Начальное (`M-SignIn`, `D-SignIn`). */
export const Ready: Story = {};

/** 2. Ссылка ещё грузится. */
export const Preparing: Story = {
	args: { ...stateArgs({ kind: 'preparing' }), botUrl: undefined }
};

/** 3. Ждём подтверждения в боте. */
export const Waiting: Story = {
	args: stateArgs({ connectionLost: false, kind: 'waiting', link: LINK })
};

/** 3a. Ждём, но связи с сервером нет (на доске нет). */
export const WaitingOffline: Story = {
	args: stateArgs({ connectionLost: true, kind: 'waiting', link: LINK })
};

/** 4. Ссылка устарела. */
export const Expired: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'expired', ttlMinutes: 10 })
};

/** 5. Вход начат в другом браузере. */
export const BrowserMismatch: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'browser-mismatch' })
};

/** 6. Вы отклонили вход. */
export const Rejected: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'rejected' })
};

/** 7. Аккаунт не найден, регистрация закрыта. */
export const RegistrationClosed: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'registration-closed' })
};

/** 8. Слишком много попыток. */
export const RateLimited: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'rate-limited', retryAfterSeconds: 300 })
};

/** 9. Telegram выключен на сервере: кнопки нет. */
export const TelegramUnavailable: Story = {
	args: stateArgs({ kind: 'unavailable' })
};

/** Сеть упала на `start` (на доске нет). */
export const NetworkError: Story = {
	args: stateArgs({ kind: 'failed', message: '', reason: 'network' })
};

/** Ключ доступа не сработал. */
export const PasskeyError: Story = {
	args: { passkeyError: 'Вход с ключом доступа отменён.' }
};

export const PasskeyPending: Story = {
	args: { isPasskeyPending: true }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: ['a'] } }
};
