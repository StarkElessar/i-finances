import { HouseholdPanel, type HouseholdPanelGateway, NETWORK_MESSAGE } from '@/features/household/model/household-panel';
import type { HouseholdPanelState } from '@/features/household/model/household-panel-state';

import type {
	ActiveHouseholdInvitation,
	HouseholdDetails,
	HouseholdSummary
} from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

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

const OWNER_VIEW: HouseholdDetails = { baseCurrency: 'BYN', id: 'household-1', members: [OWNER, ANNA], name: 'Семья', role: 'owner' };

const MEMBER_VIEW: HouseholdDetails = { ...OWNER_VIEW, role: 'member' };

const INVITATION: ActiveHouseholdInvitation = {
	createdAt: '2026-10-18T18:04:00.000Z',
	createdBy: { displayName: 'Алексей' },
	expiresAt: '2026-10-25T18:04:00.000Z',
	id: 'invitation-1'
};

const LINK = 'https://ifinances.example/invite#TOKEN-OF-THE-LINK-0123456789ABCDEFGHIJKLM';

function createGateway() {
	return {
		household: {
			get: vi.fn<HouseholdPanelGateway['household']['get']>(),
			leave: vi.fn<HouseholdPanelGateway['household']['leave']>(),
			removeMember: vi.fn<HouseholdPanelGateway['household']['removeMember']>(),
			rename: vi.fn<HouseholdPanelGateway['household']['rename']>()
		},
		invitations: {
			create: vi.fn<HouseholdPanelGateway['invitations']['create']>(),
			list: vi.fn<HouseholdPanelGateway['invitations']['list']>(),
			revoke: vi.fn<HouseholdPanelGateway['invitations']['revoke']>()
		}
	};
}

function createPanel(gateway = createGateway()) {
	const states: HouseholdPanelState[] = [];
	const onLeft = vi.fn<() => void>();
	const onRenamed = vi.fn<(household: HouseholdSummary) => void>();
	const panel = new HouseholdPanel({ gateway, onChange: (state) => states.push(state), onLeft, onRenamed });

	return { gateway, onLeft, onRenamed, panel, states };
}

async function loadedOwner() {
	const current = createPanel();

	current.gateway.household.get.mockResolvedValue({ household: OWNER_VIEW, ok: true });
	current.gateway.invitations.list.mockResolvedValue({ invitations: [INVITATION], ok: true });
	await current.panel.load();

	return current;
}

describe('HouseholdPanel load', () => {
	it('loads the members and, for an owner, the active invitations', async () => {
		const { panel } = await loadedOwner();

		expect(panel.state).toMatchObject({ household: OWNER_VIEW, invitations: [INVITATION], load: 'ready' });
	});

	it('does not ask a member for invitations: only an owner sees them', async () => {
		const { gateway, panel } = createPanel();

		gateway.household.get.mockResolvedValue({ household: MEMBER_VIEW, ok: true });
		await panel.load();

		expect(gateway.invitations.list).not.toHaveBeenCalled();
		expect(panel.state.invitations).toBeUndefined();
		expect(panel.state.load).toBe('ready');
	});

	it('starts in loading and ends in failed with a message the person can retry from', async () => {
		const { gateway, panel, states } = createPanel();

		gateway.household.get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await panel.load();

		expect(states[0]).toMatchObject({ load: 'loading' });
		expect(panel.state).toMatchObject({ load: 'failed' });
		expect(panel.state.loadError).toContain('Проверьте соединение');

		gateway.household.get.mockResolvedValueOnce({ household: MEMBER_VIEW, ok: true });
		await panel.load();

		expect(panel.state).toMatchObject({ load: 'ready', loadError: undefined });
	});

	it('shows the message of a refusal', async () => {
		const { gateway, panel } = createPanel();

		gateway.household.get.mockResolvedValue({ errorCode: 'unexpected', message: 'Не удалось выполнить действие.', ok: false });
		await panel.load();

		expect(panel.state).toMatchObject({ load: 'failed', loadError: 'Не удалось выполнить действие.' });
	});

	it('keeps the household when only the invitations fail, and can retry them', async () => {
		const { gateway, panel } = createPanel();

		gateway.household.get.mockResolvedValue({ household: OWNER_VIEW, ok: true });
		gateway.invitations.list.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await panel.load();

		expect(panel.state.load).toBe('ready');
		expect(panel.state.invitationsError).toBeDefined();

		gateway.invitations.list.mockResolvedValueOnce({ invitations: [INVITATION], ok: true });
		await panel.loadInvitations();

		expect(panel.state).toMatchObject({ invitations: [INVITATION], invitationsError: undefined });
	});
});

describe('HouseholdPanel invitations', () => {
	it('keeps the link of a created invitation in the state and refreshes the list', async () => {
		const { gateway, panel } = await loadedOwner();
		const second = { ...INVITATION, id: 'invitation-2' };

		gateway.invitations.create.mockResolvedValue({
			invitation: { expiresAt: '2026-10-25T18:04:00.000Z', id: 'invitation-2', link: LINK },
			ok: true
		});
		gateway.invitations.list.mockResolvedValue({ invitations: [INVITATION, second], ok: true });
		await panel.createInvitation();

		expect(panel.state.createdInvitation).toMatchObject({ id: 'invitation-2', link: LINK });
		expect(panel.state.invitations).toHaveLength(2);
		expect(panel.state.busy).toBeUndefined();
	});

	it('forgets the link on «Готово»: it cannot be shown again', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.create.mockResolvedValue({
			invitation: { expiresAt: '2026-10-25T18:04:00.000Z', id: 'invitation-2', link: LINK },
			ok: true
		});
		await panel.createInvitation();
		panel.dismissCreatedInvitation();

		expect(panel.state.createdInvitation).toBeUndefined();
		expect(JSON.stringify(panel.state)).not.toContain(LINK);
	});

	it('forgets the previous link when another invitation is created', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.create.mockResolvedValueOnce({
			invitation: { expiresAt: '2026-10-25T18:04:00.000Z', id: 'invitation-2', link: LINK },
			ok: true
		});
		await panel.createInvitation();
		gateway.invitations.create.mockResolvedValueOnce({
			errorCode: 'invitation-limit-reached',
			message: 'Уже есть 3 активных приглашения.',
			ok: false
		});
		await panel.createInvitation();

		expect(panel.state.createdInvitation).toBeUndefined();
	});

	it('turns the limit of three into a message and reloads the list', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.create.mockResolvedValue({
			errorCode: 'invitation-limit-reached',
			message: 'Уже есть 3 активных приглашения. Отзовите одно, чтобы создать новое.',
			ok: false
		});
		await panel.createInvitation();

		expect(panel.state.inviteError).toContain('Отзовите одно');
		expect(panel.state.createdInvitation).toBeUndefined();
		expect(gateway.invitations.list).toHaveBeenCalledTimes(2);
	});

	it('reports a network failure while creating', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.create.mockRejectedValue(new TypeError('Failed to fetch'));
		await panel.createInvitation();

		expect(panel.state.inviteError).toBe(NETWORK_MESSAGE);
		expect(panel.state.busy).toBeUndefined();
	});

	it('revokes an invitation and drops it from the list', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.revoke.mockResolvedValue({ ok: true });
		await panel.revokeInvitation('invitation-1');

		expect(gateway.invitations.revoke).toHaveBeenCalledExactlyOnceWith('invitation-1');
		expect(panel.state.invitations).toEqual([]);
	});

	it('shows the list as it is when the invitation was already gone', async () => {
		const { gateway, panel } = await loadedOwner();

		gateway.invitations.revoke.mockResolvedValue({
			errorCode: 'invitation-not-found',
			message: 'Приглашение не найдено или уже недействительно.',
			ok: false
		});
		gateway.invitations.list.mockResolvedValue({ invitations: [], ok: true });
		await panel.revokeInvitation('invitation-1');

		expect(panel.state.revokeError).toContain('не найдено');
		expect(panel.state.invitations).toEqual([]);
	});

	it('runs one request at a time', async () => {
		const { gateway, panel } = await loadedOwner();
		let resolve: (result: { ok: true }) => void = () => {};

		gateway.invitations.revoke.mockReturnValue(new Promise((done) => {
			resolve = done;
		}));

		const first = panel.revokeInvitation('invitation-1');

		expect(panel.state.busy).toEqual({ id: 'invitation-1', kind: 'revoke' });

		await panel.createInvitation();
		expect(gateway.invitations.create).not.toHaveBeenCalled();

		resolve({ ok: true });
		await first;
		expect(panel.state.busy).toBeUndefined();
	});
});

describe('HouseholdPanel rename', () => {
	it('renames and tells the caller, who patches the viewer', async () => {
		const { gateway, onRenamed, panel } = await loadedOwner();

		gateway.household.rename.mockResolvedValue({ household: { ...OWNER_VIEW, name: 'Дом' }, ok: true });
		await panel.rename('  Дом  ');

		expect(gateway.household.rename).toHaveBeenCalledExactlyOnceWith('Дом');
		expect(panel.state.household?.name).toBe('Дом');
		expect(onRenamed).toHaveBeenCalledExactlyOnceWith({ id: 'household-1', name: 'Дом', role: 'owner' });
	});

	it('does not send an empty name', async () => {
		const { gateway, panel } = await loadedOwner();

		await panel.rename('   ');

		expect(gateway.household.rename).not.toHaveBeenCalled();
		expect(panel.state.renameError).toBe('Введите название окружения.');
	});

	it('shows the refusal of the server', async () => {
		const { gateway, onRenamed, panel } = await loadedOwner();

		gateway.household.rename.mockResolvedValue({
			errorCode: 'owner-required',
			message: 'Это может сделать только владелец окружения.',
			ok: false
		});
		await panel.rename('Дом');

		expect(panel.state.renameError).toContain('только владелец');
		expect(onRenamed).not.toHaveBeenCalled();
	});
});

describe('HouseholdPanel confirmations', () => {
	it('asks first and removes only after the confirmation', async () => {
		const { gateway, panel } = await loadedOwner();

		panel.ask({ kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } });

		expect(panel.state.confirmation).toEqual({ kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } });
		expect(gateway.household.removeMember).not.toHaveBeenCalled();

		gateway.household.removeMember.mockResolvedValue({ household: { ...OWNER_VIEW, members: [OWNER] }, ok: true });
		await panel.confirm();

		expect(gateway.household.removeMember).toHaveBeenCalledExactlyOnceWith('user-2');
		expect(panel.state.household?.members).toEqual([OWNER]);
		expect(panel.state.confirmation).toBeUndefined();
	});

	it('closes the question without a request on «Отмена»', async () => {
		const { gateway, panel } = await loadedOwner();

		panel.ask({ kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } });
		panel.cancelConfirmation();

		expect(panel.state.confirmation).toBeUndefined();
		expect(gateway.household.removeMember).not.toHaveBeenCalled();
	});

	it('keeps the question open with the error when the removal fails', async () => {
		const { gateway, panel } = await loadedOwner();

		panel.ask({ kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } });
		gateway.household.removeMember.mockRejectedValue(new TypeError('Failed to fetch'));
		await panel.confirm();

		expect(panel.state.confirmation).toBeDefined();
		expect(panel.state.confirmError).toBe(NETWORK_MESSAGE);
	});

	it('reloads the list when the member was removed elsewhere meanwhile', async () => {
		const { gateway, panel } = await loadedOwner();

		panel.ask({ kind: 'remove', member: { displayName: 'Анна', userId: 'user-2' } });
		gateway.household.removeMember.mockResolvedValue({ errorCode: 'member-not-found', message: 'Участник не найден.', ok: false });
		gateway.household.get.mockResolvedValue({ household: { ...OWNER_VIEW, members: [OWNER] }, ok: true });
		await panel.confirm();

		expect(panel.state.confirmation).toBeUndefined();
		expect(panel.state.household?.members).toEqual([OWNER]);
	});

	it('leaves the household, tells the caller and keeps nothing', async () => {
		const { gateway, onLeft, panel } = createPanel();

		gateway.household.get.mockResolvedValue({ household: MEMBER_VIEW, ok: true });
		await panel.load();
		panel.ask({ kind: 'leave' });
		gateway.household.leave.mockResolvedValue({ ok: true });
		await panel.confirm();

		expect(gateway.household.leave).toHaveBeenCalledTimes(1);
		expect(onLeft).toHaveBeenCalledTimes(1);
		expect(panel.state.confirmation).toBeUndefined();
	});

	it('does not let the last owner leave and says why', async () => {
		const { gateway, onLeft, panel } = await loadedOwner();

		panel.ask({ kind: 'leave' });
		gateway.household.leave.mockResolvedValue({
			errorCode: 'last-owner',
			message: 'Вы единственный владелец окружения, поэтому не можете его покинуть.',
			ok: false
		});
		await panel.confirm();

		expect(onLeft).not.toHaveBeenCalled();
		expect(panel.state.confirmError).toContain('единственный владелец');
		expect(panel.state.confirmation).toEqual({ kind: 'leave' });
	});

	it('confirms nothing when nothing was asked', async () => {
		const { gateway, panel } = await loadedOwner();

		await panel.confirm();

		expect(gateway.household.leave).not.toHaveBeenCalled();
		expect(gateway.household.removeMember).not.toHaveBeenCalled();
	});

	it('ignores late answers after the dialog was closed', async () => {
		const { gateway, panel, states } = createPanel();

		gateway.household.get.mockResolvedValue({ household: MEMBER_VIEW, ok: true });

		const loading = panel.load();
		const seen = states.length;

		panel.dispose();
		await loading;

		expect(states).toHaveLength(seen);
	});
});
