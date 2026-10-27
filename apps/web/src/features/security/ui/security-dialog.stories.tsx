import { CurrentViewerProvider } from '@/entities/viewer';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { SecurityDialog } from './security-dialog';
import { createFakeSecurityClient } from './security-story-fixtures';

const CODE = 'abcdefghijklmnopqrstuvwxyzABCDEF';

const VIEWER = {
	canCreateHousehold: true,
	displayName: 'Алексей',
	hasPassword: true,
	household: { id: 'household', name: 'Семья', role: 'owner' },
	id: 'user',
	isPlatformAdmin: false,
	telegram: null,
	username: 'alexey'
} as const;

/** Fake clients: the stories never reach a server. The dialog is a bottom sheet below 640 px and a 560 px dialog above. */
const authClient = {
	currentSession: async () => ({ authenticated: false }) as const,
	registerPasskey: async () => ({ ok: true }) as const,
	supportsPasskeys: () => true
};

const telegramLinkClient = {
	cancelTelegramLink: async () => ({ ok: true }) as const,
	completeTelegramLink: async () => ({ ok: true, status: 'pending' }) as const,
	startTelegramLink: async () => ({
		appUrl: `tg://resolve?domain=i_finances_bot&start=${CODE}`,
		botUrl: `https://t.me/i_finances_bot?start=${CODE}`,
		code: CODE,
		expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
		ok: true
	}) as const
};

const meta = {
	title: 'Security/SecurityDialog',
	component: SecurityDialog,
	args: {
		authClient,
		onOpenChange: () => undefined,
		open: true,
		securityClient: createFakeSecurityClient() as never,
		telegramLinkClient: telegramLinkClient as never
	},
	decorators: [
		(Story) => (
			<CurrentViewerProvider initialViewer={VIEWER}>
				<Story/>
			</CurrentViewerProvider>
		)
	],
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof SecurityDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/** `M-Security` (phone) and `D-Security` (1280): switch the viewport in the toolbar. */
export const Default: Story = {};

export const TelegramLinked: Story = {
	decorators: [
		(Story) => (
			<CurrentViewerProvider initialViewer={{ ...VIEWER, telegram: { username: 'alexey' } }}>
				<Story/>
			</CurrentViewerProvider>
		)
	]
};

/** An account created through Telegram: no password block to fill. */
export const WithoutPassword: Story = {
	decorators: [
		(Story) => (
			<CurrentViewerProvider initialViewer={{ ...VIEWER, hasPassword: false, telegram: { username: 'alexey' } }}>
				<Story/>
			</CurrentViewerProvider>
		)
	]
};
