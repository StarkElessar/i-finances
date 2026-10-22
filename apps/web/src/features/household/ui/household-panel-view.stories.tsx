import type { ActiveHouseholdInvitation, HouseholdDetails } from '@i-finances/contracts';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { HouseholdPanelState } from '../model/household-panel-state';

import { HouseholdPanelView } from './household-panel-view';

const NOW = Date.parse('2026-10-18T18:04:00.000Z');

const OWNER = {
	displayName: 'Алексей',
	joinedAt: '2026-03-03T09:00:00.000Z',
	role: 'owner',
	telegramUsername: 'alexey',
	userId: 'user-1'
} as const;

const ANNA = {
	displayName: 'Анна',
	joinedAt: '2026-10-18T18:04:00.000Z',
	role: 'member',
	telegramUsername: 'anna',
	userId: 'user-2'
} as const;

const OWNER_VIEW: HouseholdDetails = {
	baseCurrency: 'BYN',
	id: 'household-1',
	members: [OWNER, ANNA],
	name: 'Семья',
	role: 'owner'
};

const MEMBER_VIEW: HouseholdDetails = { ...OWNER_VIEW, role: 'member' };

const INVITATIONS: ActiveHouseholdInvitation[] = [
	{ createdAt: '2026-10-18T18:04:00.000Z', createdBy: { displayName: 'Алексей' }, expiresAt: '2026-10-25T17:04:00.000Z', id: 'i-1' },
	{ createdAt: '2026-10-17T09:30:00.000Z', createdBy: { displayName: 'Алексей' }, expiresAt: '2026-10-24T06:30:00.000Z', id: 'i-2' }
];

const noop = () => {};

const handlers = {
	now: NOW,
	onAskLeave: noop,
	onAskRemove: noop,
	onCancelConfirmation: noop,
	onConfirm: noop,
	onCreateInvitation: noop,
	onDismissCreatedInvitation: noop,
	onRename: noop,
	onRetryInvitations: noop,
	onRetryLoad: noop,
	onRevokeInvitation: noop
};

function owner(overrides: Partial<HouseholdPanelState> = {}): HouseholdPanelState {
	return { household: OWNER_VIEW, invitations: INVITATIONS, load: 'ready', ...overrides };
}

// The body of the dialog of the boards `M-Household`, `D-Household`; the dialog chrome is the kit `Dialog`.
const meta = {
	title: 'Household/Panel',
	component: HouseholdPanelView,
	args: { ...handlers, state: owner(), viewerId: 'user-1' }
} satisfies Meta<typeof HouseholdPanelView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Вид владельца. */
export const Owner: Story = {};

/** Только вы. */
export const OnlyYou: Story = {
	args: { state: owner({ household: { ...OWNER_VIEW, members: [OWNER] }, invitations: [] }) }
};

/** Достигнут лимит: 3 активных приглашения. */
export const InvitationLimit: Story = {
	args: {
		state: owner({
			invitations: [
				...INVITATIONS,
				{
					createdAt: '2026-10-17T15:10:00.000Z',
					createdBy: { displayName: 'Алексей' },
					expiresAt: '2026-10-24T15:10:00.000Z',
					id: 'i-3'
				}
			]
		})
	}
};

/** Удаление участника: подтверждение внутри диалога. */
export const ConfirmRemove: Story = {
	args: { state: owner({ confirmation: { kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } } }) }
};

export const ConfirmRemoveFailed: Story = {
	args: {
		state: owner({
			confirmation: { kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } },
			confirmError: 'Не удалось выполнить действие. Проверьте соединение и повторите.'
		})
	}
};

/** Вид участника: без действий, «Покинуть окружение». */
export const Member: Story = {
	args: { state: { household: MEMBER_VIEW, load: 'ready' }, viewerId: 'user-2' }
};

export const ConfirmLeave: Story = {
	args: { state: { confirmation: { kind: 'leave' }, household: MEMBER_VIEW, load: 'ready' }, viewerId: 'user-2' }
};

/** 409 last-owner. */
export const LastOwnerRefused: Story = {
	args: {
		state: owner({
			confirmation: { kind: 'leave' },
			confirmError: 'Вы единственный владелец окружения, поэтому не можете его покинуть.',
			household: { ...OWNER_VIEW, members: [OWNER, { ...ANNA, role: 'owner' }] }
		})
	}
};

export const Loading: Story = {
	args: { state: { load: 'loading' } }
};

export const LoadFailed: Story = {
	args: { state: { load: 'failed', loadError: 'Не удалось загрузить окружение. Проверьте соединение и повторите.' } }
};

export const InvitationsFailed: Story = {
	args: {
		state: owner({
			invitations: undefined,
			invitationsError: 'Не удалось загрузить приглашения. Проверьте соединение и повторите.'
		})
	}
};

/** Приглашение создано: ссылка показывается один раз. */
export const InvitationCreated: Story = {
	args: {
		state: owner({
			createdInvitation: {
				expiresAt: '2026-10-25T18:04:00.000Z',
				id: 'i-new',
				link: 'https://ifinances.example/invite#aB3kQ9xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxZq9'
			}
		})
	}
};
