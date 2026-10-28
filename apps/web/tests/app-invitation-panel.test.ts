import { ApiHttpError } from '@/shared/api';

import { type AppInvitationGateway, AppInvitationPanel } from '@/features/app-invitation/model/app-invitation-panel';
import type { AppInvitationPanelState } from '@/features/app-invitation/model/app-invitation-panel-state';
import { selectAppInvitations } from '@/features/app-invitation/model/select-app-invitations';

import type { AppInvitationListItem } from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

const INVITATION: AppInvitationListItem = {
	acceptedAt: null,
	acceptedBy: null,
	createdAt: '2026-10-27T12:00:00.000Z',
	expiresAt: '2026-11-03T12:00:00.000Z',
	id: 'invitation-1',
	note: 'Для Марии',
	status: 'active'
};

const CREATED = { expiresAt: INVITATION.expiresAt, id: 'new-invitation', link: `https://ifinances.example/invite#${'x'.repeat(43)}` };

function createPanel(invitations: AppInvitationListItem[] = [], now = () => NOW) {
	const gateway = {
		create: vi.fn<AppInvitationGateway['create']>().mockResolvedValue({ invitation: CREATED, ok: true }),
		list: vi.fn<AppInvitationGateway['list']>().mockResolvedValue({ invitations, ok: true }),
		revoke: vi.fn<AppInvitationGateway['revoke']>().mockResolvedValue({ ok: true })
	};
	const onAccessLost = vi.fn();
	let visibleState: AppInvitationPanelState | undefined;
	const panel = new AppInvitationPanel({
		gateway, now, onAccessLost, onChange: (state) => {
			visibleState = state;
		}
	});

	return { gateway, onAccessLost, panel, visibleState: () => visibleState };
}

function accepted(index: number): AppInvitationListItem {
	return {
		...INVITATION,
		acceptedAt: `2026-10-${String(index + 10)}T12:00:00.000Z`,
		acceptedBy: { displayName: `Гость ${index}`, telegramUsername: null },
		id: `accepted-${index}`,
		status: 'accepted'
	};
}

describe('application invitation dialog state', () => {
	it('loads an empty list, retries a network error and prevents concurrent loads', async () => {
		const { gateway, panel } = createPanel();

		gateway.list.mockRejectedValueOnce(new TypeError('offline'));
		expect(panel.state.load).toBe('loading');
		const request = panel.load();

		await panel.load();
		expect(gateway.list).toHaveBeenCalledTimes(1);
		await request;
		expect(panel.state).toMatchObject({ load: 'failed', error: expect.stringContaining('Проверьте соединение') });
		await panel.load();
		expect(panel.state).toMatchObject({ load: 'ready', invitations: [], error: undefined });
	});

	it('creates with an optional trimmed note; only the created view contains the link', async () => {
		const { gateway, panel } = createPanel();

		await panel.load();
		panel.startCreate();
		expect(panel.state.view).toBe('create');
		panel.setNote('  Для Марии  ');
		await panel.create();
		expect(gateway.create).toHaveBeenCalledExactlyOnceWith({ note: 'Для Марии' });
		expect(panel.state).toMatchObject({ created: CREATED, view: 'created', busy: undefined });
		expect(JSON.stringify(panel.state.invitations)).not.toContain(CREATED.link);
		panel.back();
		expect(panel.state).toMatchObject({ created: undefined, view: 'main', note: '' });
		expect(JSON.stringify(panel.state)).not.toContain(CREATED.link);
	});

	it('accepts 80 characters, rejects 81 and control characters before calling the client', async () => {
		const { gateway, panel } = createPanel();

		await panel.load();
		panel.startCreate();
		panel.setNote('я'.repeat(81));
		await panel.create();
		expect(panel.state.noteError).toContain('80');
		panel.setNote('Ма\nрия');
		await panel.create();
		expect(panel.state.noteError).toContain('недопустимые');
		expect(gateway.create).not.toHaveBeenCalled();
		panel.setNote('я'.repeat(80));
		await panel.create();
		expect(gateway.create).toHaveBeenCalledTimes(1);
	});

	it('sends no note when it is empty and guards double submission', async () => {
		const { gateway, panel } = createPanel();

		await panel.load();
		panel.startCreate();
		const request = panel.create();

		const duplicate = panel.create();

		panel.back();
		expect(panel.state.busy).toBe('create');
		await duplicate;
		await request;
		expect(gateway.create).toHaveBeenCalledExactlyOnceWith({});
	});

	it('shows creation network and field errors without losing the draft', async () => {
		const { gateway, panel } = createPanel();

		await panel.load();
		panel.startCreate();
		panel.setNote('Мария');
		gateway.create.mockRejectedValueOnce(new TypeError('offline'));
		await panel.create();
		expect(panel.state).toMatchObject({ error: expect.stringContaining('Проверьте соединение'), note: 'Мария', view: 'create' });
		gateway.create.mockResolvedValueOnce({
			errorCode: 'invalid-input', fieldErrors: { note: 'Ошибка заметки' }, message: 'Проверьте', ok: false
		});
		await panel.create();
		expect(panel.state.noteError).toBe('Ошибка заметки');
	});

	it('blocks creation at 20 active invitations but counts accepted ones separately', async () => {
		const full = Array.from({ length: 20 }, (_, index) => ({ ...INVITATION, id: `active-${index}` }));
		const { gateway, panel } = createPanel([...full, accepted(1)]);

		await panel.load();
		panel.startCreate();
		await panel.create();
		expect(panel.state.view).toBe('main');
		expect(gateway.create).not.toHaveBeenCalled();
		panel.askRevoke('active-0');
		await panel.confirmRevoke();
		panel.startCreate();
		expect(panel.state.view).toBe('create');
	});

	it('handles a concurrent active limit and the daily limit with Retry-After', async () => {
		const limited = createPanel();

		await limited.panel.load();
		limited.panel.startCreate();
		limited.gateway.create.mockResolvedValueOnce({ errorCode: 'invitation-limit-reached', message: '20 активных', ok: false });
		await limited.panel.create();
		expect(limited.panel.state).toMatchObject({ limitReached: true, error: '20 активных' });

		let now = NOW;
		const { gateway, panel } = createPanel([], () => now);

		await panel.load();
		panel.startCreate();
		gateway.create.mockResolvedValueOnce({ errorCode: 'rate-limited', message: '50 за сутки', ok: false, retryAfterSeconds: 241 });
		await panel.create();
		expect(panel.state).toMatchObject({ error: '50 за сутки', createRetryAt: NOW + 241_000 });
		await panel.create();
		expect(gateway.create).toHaveBeenCalledTimes(1);
		now += 241_000;
		await panel.create();
		expect(gateway.create).toHaveBeenCalledTimes(2);
		expect(panel.state.view).toBe('created');
	});

	it('reloads after a concurrent active limit so the main view offers current revoke targets', async () => {
		const { gateway, panel } = createPanel();

		await panel.load();
		panel.startCreate();
		gateway.create.mockResolvedValueOnce({ errorCode: 'invitation-limit-reached', message: '20 активных', ok: false });
		await panel.create();
		gateway.list.mockResolvedValueOnce({ invitations: [INVITATION], ok: true });
		panel.back();
		await vi.waitFor(() => expect(panel.state).toMatchObject({ invitations: [INVITATION], load: 'ready', view: 'main' }));
	});

	it('handles a contract 401 while loading and blocks all subsequent actions', async () => {
		const { gateway, panel, onAccessLost } = createPanel();

		gateway.list.mockResolvedValueOnce({ errorCode: 'unauthenticated', message: 'Войдите снова', ok: false });
		await panel.load();
		expect(panel.state.load).toBe('forbidden');
		expect(onAccessLost).toHaveBeenCalledOnce();
	});

	it('asks for confirmation, keeps revoke errors inside it and permits retry or cancellation', async () => {
		const { gateway, panel } = createPanel([INVITATION]);

		await panel.load();
		await panel.confirmRevoke();
		expect(gateway.revoke).not.toHaveBeenCalled();
		panel.askRevoke(INVITATION.id);
		panel.cancelRevoke();
		expect(panel.state.confirmingId).toBeUndefined();
		panel.askRevoke(INVITATION.id);
		gateway.revoke.mockRejectedValueOnce(new TypeError('offline'));
		await panel.confirmRevoke();
		expect(panel.state).toMatchObject({ confirmingId: INVITATION.id, confirmError: expect.stringContaining('Проверьте соединение') });
		gateway.revoke.mockResolvedValueOnce({ errorCode: 'invalid-origin', message: 'Обновите страницу', ok: false });
		await panel.confirmRevoke();
		expect(panel.state.confirmError).toBe('Обновите страницу');
		await panel.confirmRevoke();
		expect(panel.state).toMatchObject({ invitations: [], confirmingId: undefined, confirmError: undefined });
		expect(gateway.revoke).toHaveBeenLastCalledWith(INVITATION.id);
	});

	it('reloads after a lost revoke response and a not-found retry, freeing capacity for creation', async () => {
		const full = Array.from({ length: 20 }, (_, index) => ({ ...INVITATION, id: `active-${index}` }));
		const remaining = full.slice(1);
		const { gateway, panel } = createPanel(full);

		await panel.load();
		panel.startCreate();
		await panel.create();
		expect(panel.state.view).toBe('main');
		expect(gateway.create).not.toHaveBeenCalled();
		panel.askRevoke('active-0');
		gateway.revoke.mockRejectedValueOnce(new TypeError('offline'));
		gateway.revoke.mockResolvedValue({ errorCode: 'invitation-not-found', message: 'Уже недействительно', ok: false });
		await panel.confirmRevoke();
		expect(panel.state).toMatchObject({
			confirmingId: 'active-0', confirmError: expect.stringContaining('Проверьте соединение'), invitations: full
		});
		gateway.list.mockResolvedValueOnce({ invitations: remaining, ok: true });
		await panel.confirmRevoke();
		expect(gateway.revoke).toHaveBeenCalledTimes(2);
		expect(gateway.revoke).toHaveBeenNthCalledWith(1, 'active-0');
		expect(gateway.revoke).toHaveBeenNthCalledWith(2, 'active-0');
		expect(gateway.list).toHaveBeenCalledTimes(2);
		expect(panel.state).toMatchObject({
			busy: undefined,
			confirmError: undefined,
			confirmingId: undefined,
			error: 'Уже недействительно',
			invitations: remaining,
			limitReached: false,
			load: 'ready',
			view: 'main'
		});
		expect(selectAppInvitations(panel.state.invitations, false).active).toHaveLength(19);
		await panel.confirmRevoke();
		expect(gateway.revoke).toHaveBeenCalledTimes(2);
		panel.startCreate();
		expect(panel.state.view).toBe('create');
		await panel.create();
		expect(gateway.create).toHaveBeenCalledExactlyOnceWith({});
		expect(panel.state.view).toBe('created');
	});

	it.each([401, 403, 404])('clears sensitive state and disables actions on HTTP %i', async (status) => {
		const { gateway, onAccessLost, panel } = createPanel([INVITATION]);

		await panel.load();
		panel.askRevoke(INVITATION.id);
		gateway.revoke.mockRejectedValueOnce(new ApiHttpError(status, { error: { code: 'not_found' } }, '/api/app-invitations'));
		await panel.confirmRevoke();
		expect(panel.state).toMatchObject({ load: 'forbidden', invitations: [] });
		expect(panel.state.created).toBeUndefined();
		expect(panel.state.confirmingId).toBeUndefined();
		expect(onAccessLost).toHaveBeenCalledTimes(1);
		panel.startCreate();
		await panel.load();
		expect(gateway.list).toHaveBeenCalledTimes(1);
	});

	it('erases a created link on close and ignores creation that finishes after close', async () => {
		const { panel, visibleState } = createPanel();

		await panel.load();
		panel.startCreate();
		await panel.create();
		panel.dispose();
		expect(JSON.stringify(panel.state)).not.toContain(CREATED.link);
		expect(JSON.stringify(visibleState())).not.toContain(CREATED.link);

		const pending = createPanel();
		let complete: ((result: Awaited<ReturnType<AppInvitationGateway['create']>>) => void) | undefined;

		pending.gateway.create.mockImplementationOnce(() => new Promise((resolve) => {
			complete = resolve;
		}));
		await pending.panel.load();
		pending.panel.startCreate();
		const request = pending.panel.create();

		pending.panel.dispose();
		complete?.({ invitation: CREATED, ok: true });
		await request;
		expect(pending.panel.state.created).toBeUndefined();
		expect(pending.visibleState()?.created).toBeUndefined();
	});

	it('shows five newest accepted records, expands all, collapses and resets on reopening', async () => {
		const records = Array.from({ length: 8 }, (_, index) => accepted(index));
		const { panel } = createPanel([INVITATION, ...records]);

		await panel.load();
		const preview = selectAppInvitations(panel.state.invitations, panel.state.expanded);

		expect(preview.visibleAccepted.map((invitation) => invitation.id)).toEqual([
			'accepted-7', 'accepted-6', 'accepted-5', 'accepted-4', 'accepted-3'
		]);
		expect(preview.canExpand).toBe(true);
		panel.toggleAccepted();
		expect(selectAppInvitations(panel.state.invitations, panel.state.expanded).visibleAccepted).toHaveLength(8);
		panel.toggleAccepted();
		expect(selectAppInvitations(panel.state.invitations, panel.state.expanded).visibleAccepted).toHaveLength(5);
		panel.dispose();
		expect(createPanel(records).panel.state.expanded).toBe(false);
		for (const count of [0, 1, 5]) {
			expect(selectAppInvitations(records.slice(0, count), false).canExpand).toBe(false);
		}
	});
});
