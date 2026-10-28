import css from './app-invitation-dialog.module.scss';

import { Button, Dialog } from '@/shared/ui';

import type { AppInvitationListItem } from '@i-finances/contracts';
import { MAX_ACTIVE_APP_INVITATIONS } from '@i-finances/contracts';
import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { APP_INVITATION_ACCESS_LOST, APP_INVITATION_NETWORK_ERROR } from '../lib/app-invitation-error';
import type { AppInvitationPanelState } from '../model/app-invitation-panel-state';

import { AppInvitationDialog } from './app-invitation-dialog';
import { AppInvitationDialogView } from './app-invitation-dialog-view';
import { createAppInvitationStoryClient } from './app-invitation-story-client';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

const ACTIVE: AppInvitationListItem = {
	acceptedAt: null,
	acceptedBy: null,
	createdAt: '2026-10-27T12:00:00.000Z',
	expiresAt: '2026-11-03T12:00:00.000Z',
	id: 'invitation-1',
	note: 'Для Марии',
	status: 'active'
};

const ACCEPTED: AppInvitationListItem[] = [
	'Ольга К.', 'Пётр В.', 'Татьяна С.', 'Андрей М.', 'Елена Р.', 'Дмитрий Л.', 'Анна Ж.', 'Максим Б.'
]
	.map((displayName, index) => ({
		...ACTIVE,
		acceptedAt: new Date(NOW - index * 86_400_000).toISOString(),
		acceptedBy: { displayName, telegramUsername: index === 1 ? null : `guest_${index}` },
		id: `accepted-${index}`,
		note: null,
		status: 'accepted'
	}));

function ready(overrides: Partial<AppInvitationPanelState> = {}): AppInvitationPanelState {
	return { expanded: false, invitations: [ACTIVE, ...ACCEPTED], load: 'ready', note: '', view: 'main', ...overrides };
}

function noop() {}

const meta = {
	title: 'AppInvitation/Dialog',
	component: AppInvitationDialogView,
	args: {
		now: NOW,
		canShare: true,
		state: ready(),
		onAskRevoke: noop,
		onBack: noop,
		onCancelRevoke: noop,
		onClose: noop,
		onConfirmRevoke: noop,
		onCreate: noop,
		onNoteInput: noop,
		onRetry: noop,
		onStartCreate: noop,
		onToggleAccepted: noop
	},
	render: (args) => (
		<Dialog.Root open>
			<Dialog.Content class={css.dialog}>
				<AppInvitationDialogView {...args}/>
			</Dialog.Content>
		</Dialog.Root>
	),
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof AppInvitationDialogView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Switch themes and viewport (390 / 1280) in the toolbar; both use the same kit primitives. */
export const Default: Story = {};

/** Exercise the actual model: expand, create, copy, dismiss, close/reopen, and revoke. */
export const Interactive: Story = {
	render: () => {
		const [open, setOpen] = createSignal(true);
		const client = createAppInvitationStoryClient([ACTIVE, ...ACCEPTED]);

		return (
			<>
				<Button onClick={() => setOpen(true)}>Открыть приглашения</Button>
				<AppInvitationDialog client={client} onOpenChange={setOpen} open={open()}/>
			</>
		);
	}
};

export const Hover: Story = { parameters: { pseudo: { hover: true } } };

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } };

export const Empty: Story = { args: { state: ready({ invitations: [] }) } };

export const Expanded: Story = { args: { state: ready({ expanded: true }) } };

export const FiveAccepted: Story = { args: { state: ready({ invitations: [ACTIVE, ...ACCEPTED.slice(0, 5)] }) } };

export const Create: Story = { args: { state: ready({ view: 'create' }) } };

export const NoteTooLong: Story = {
	args: { state: ready({ note: 'я'.repeat(81), noteError: 'Заметка не длиннее 80 символов.', view: 'create' }) }
};

export const Creating: Story = { args: { state: ready({ busy: 'create', note: 'Для Марии', view: 'create' }) } };

export const CreateFailed: Story = { args: { state: ready({ error: APP_INVITATION_NETWORK_ERROR, note: 'Для Марии', view: 'create' }) } };

export const Created: Story = {
	args: {
		state: ready({
			created: { expiresAt: ACTIVE.expiresAt, id: 'new-invitation', link: `https://ifinances.example/invite#${'x'.repeat(43)}` },
			view: 'created'
		})
	}
};

export const CreatedWithoutShare: Story = { args: { ...Created.args, canShare: false } };

export const ActiveLimit: Story = {
	args: {
		state: ready({
			invitations: [
				...Array.from({ length: MAX_ACTIVE_APP_INVITATIONS }, (_, index) => ({ ...ACTIVE, id: `active-${index}` })),
				...ACCEPTED
			]
		})
	}
};

export const ConfirmRevoke: Story = { args: { state: ready({ confirmingId: ACTIVE.id }) } };

export const RevokeFailed: Story = { args: { state: ready({ confirmError: APP_INVITATION_NETWORK_ERROR, confirmingId: ACTIVE.id }) } };

export const Revoking: Story = { args: { state: ready({ busy: 'revoke', confirmingId: ACTIVE.id }) } };

export const Loading: Story = { args: { state: ready({ invitations: [], load: 'loading' }) } };

export const LoadFailed: Story = { args: { state: ready({ error: APP_INVITATION_NETWORK_ERROR, load: 'failed' }) } };

export const RateLimited: Story = {
	args: { state: ready({ createRetryAt: NOW + 241_000, error: 'За сутки можно создать не больше 50 приглашений.', view: 'create' }) }
};

export const AccessLost: Story = { args: { state: ready({ error: APP_INVITATION_ACCESS_LOST, invitations: [], load: 'forbidden' }) } };
