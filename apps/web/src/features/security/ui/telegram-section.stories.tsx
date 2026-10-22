import { ApiHttpError } from '@/shared/api';

import { type TelegramLinkErrorCode, telegramLinkErrorMessageByCode } from '@i-finances/contracts';
import { expect, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { TelegramLinkGateway } from '../model/telegram-link-protocol';

import { never } from './security-story-fixtures';
import { TelegramSection } from './telegram-section';

const CODE = 'abcdefghijklmnopqrstuvwxyzABCDEF';

function startResult() {
	return {
		appUrl: `tg://resolve?domain=i_finances_bot&start=${CODE}`,
		botUrl: `https://t.me/i_finances_bot?start=${CODE}`,
		code: CODE,
		expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
		ok: true
	} as const;
}

function createGateway(overrides: Partial<TelegramLinkGateway> = {}): TelegramLinkGateway {
	return {
		cancelTelegramLink: async () => ({ ok: true }),
		completeTelegramLink: async () => ({ ok: true, status: 'pending' }),
		currentSession: async () => ({ authenticated: false }),
		startTelegramLink: async () => startResult(),
		...overrides
	};
}

function refusal(status: number, errorCode: TelegramLinkErrorCode, retryAfterSeconds?: number) {
	const body = { errorCode, message: telegramLinkErrorMessageByCode[errorCode], ok: false };

	return new ApiHttpError(status, body, '/api/auth/telegram/link', retryAfterSeconds);
}

const meta = {
	title: 'Security/TelegramSection',
	component: TelegramSection,
	args: {
		gateway: createGateway(),
		onLinked: () => undefined,
		telegram: null,
		userId: 'u-1'
	}
} satisfies Meta<typeof TelegramSection>;

export default meta;

type Story = StoryObj<typeof meta>;

async function pressStart(canvasElement: HTMLElement) {
	await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Привязать Telegram' }));
}

async function pressLink(canvasElement: HTMLElement) {
	await pressStart(canvasElement);

	const link = await within(canvasElement).findByRole('link', { name: 'Открыть Telegram' });

	// A link to the bot would open a new tab: Storybook only shows the waiting state.
	link.addEventListener('click', (event) => event.preventDefault());
	await userEvent.click(link);
}

/** `D-Security`: «Telegram: @username, привязан». There is no unlinking in v1. */
export const Linked: Story = {
	args: { telegram: { username: 'alexey' } }
};

export const LinkedWithoutUsername: Story = {
	args: { telegram: { username: null } }
};

/** Opening Security only offers a button; it does not prepare a bot link. */
export const Unlinked: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole('button', { name: 'Привязать Telegram' })).toBeEnabled();
		await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
	}
};

/** The link is being prepared. */
export const Preparing: Story = {
	args: { gateway: createGateway({ startTelegramLink: () => never() }) },
	play: ({ canvasElement }) => pressStart(canvasElement)
};

/** The link is ready: a plain `https://t.me` anchor and the warning not to forward it. */
export const Ready: Story = {
	play: async ({ canvasElement }) => {
		await pressStart(canvasElement);

		const link = await within(canvasElement).findByRole('link', { name: 'Открыть Telegram' });

		await expect(link).toHaveAttribute('href', `https://t.me/i_finances_bot?start=${CODE}`);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	}
};

/** `D-Security`, «Ожидание подтверждения». */
export const Waiting: Story = {
	play: ({ canvasElement }) => pressLink(canvasElement)
};

/** After the success the linked name is shown large, with what to do if it is not the person's own (review A4). */
export const LinkedNow: Story = {
	args: {
		gateway: createGateway({ completeTelegramLink: async () => ({ ok: true, status: 'linked', telegram: { username: 'alexey' } }) })
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

/** `D-Security`, «Этот Telegram привязан к другому аккаунту». */
export const LinkedElsewhere: Story = {
	args: {
		gateway: createGateway({
			completeTelegramLink: () => Promise.reject(refusal(409, 'telegram-linked-elsewhere'))
		})
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

/** `D-Security`, «К аккаунту уже привязан другой Telegram». */
export const AccountHasTelegram: Story = {
	args: {
		gateway: createGateway({
			startTelegramLink: () => Promise.reject(refusal(409, 'account-has-telegram'))
		})
	},
	play: ({ canvasElement }) => pressStart(canvasElement)
};

export const Rejected: Story = {
	args: {
		gateway: createGateway({
			completeTelegramLink: () => Promise.reject(refusal(410, 'link-rejected'))
		})
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

export const Expired: Story = {
	args: {
		gateway: createGateway({
			completeTelegramLink: () => Promise.reject(refusal(410, 'link-expired'))
		})
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

export const OtherBrowser: Story = {
	args: {
		gateway: createGateway({
			completeTelegramLink: () => Promise.reject(refusal(403, 'browser-mismatch'))
		})
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

export const ConnectionLost: Story = {
	args: {
		gateway: createGateway({ completeTelegramLink: () => Promise.reject(new TypeError('Failed to fetch')) })
	},
	play: ({ canvasElement }) => pressLink(canvasElement)
};

export const TooManyAttempts: Story = {
	args: {
		gateway: createGateway({
			startTelegramLink: () => Promise.reject(refusal(429, 'rate-limited', 90))
		})
	},
	play: ({ canvasElement }) => pressStart(canvasElement)
};

/** Telegram is known to be off only after the press: explain why the action disappeared. */
export const Unavailable: Story = {
	args: {
		gateway: createGateway({
			startTelegramLink: () => Promise.reject(refusal(404, 'telegram-unavailable'))
		})
	},
	play: async ({ canvasElement }) => {
		await pressStart(canvasElement);

		const canvas = within(canvasElement);

		await expect(await canvas.findByRole('status')).toHaveTextContent('Привязка Telegram сейчас недоступна.');
		await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
		await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
	}
};
