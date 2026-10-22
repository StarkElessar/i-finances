import { ApiHttpError } from '@/shared/api';

import { describeInvitationScreen } from '@/features/invitation/model/describe-invitation-screen';
import { describeUnavailable } from '@/features/invitation/model/describe-unavailable';
import {
	ACCEPT_NETWORK_MESSAGE,
	InvitationFlow,
	type InvitationGateway,
	PREVIEW_NETWORK_MESSAGE
} from '@/features/invitation/model/invitation-flow';
import type { InvitationFlowState } from '@/features/invitation/model/invitation-state';
import { PendingInvitationStore } from '@/features/invitation/model/pending-invitation-store';

import type {
	AcceptInvitationResult,
	HouseholdInvitationFailure,
	HouseholdInvitationUnavailableReason,
	HouseholdSummary,
	InvitationPreviewResult
} from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

const TOKEN = `${'aB3_-'.repeat(8)}xyz`;

const PREVIEW = { expiresAt: '2026-10-25T18:04:00.000Z', householdName: 'Семья', inviterName: 'Сергей' };

const JOINED: HouseholdSummary = { id: 'household-1', name: 'Семья', role: 'member' };

function failure(overrides: Partial<HouseholdInvitationFailure>): HouseholdInvitationFailure {
	return { errorCode: 'unexpected', message: 'Сообщение сервера.', ok: false, ...overrides };
}

function unavailable(reason?: HouseholdInvitationUnavailableReason): HouseholdInvitationFailure {
	return failure({ errorCode: 'invitation-unavailable', message: 'Ссылка приглашения недействительна.', reason });
}

type Setup = {
	flow: InvitationFlow;
	gateway: {
		accept: ReturnType<typeof vi.fn<InvitationGateway['accept']>>;
		preview: ReturnType<typeof vi.fn<InvitationGateway['preview']>>;
	};
	onAccepted: ReturnType<typeof vi.fn<(household: HouseholdSummary) => void>>;
	states: InvitationFlowState[];
	store: PendingInvitationStore;
};

function setup(): Setup {
	const store = new PendingInvitationStore(undefined);
	const states: InvitationFlowState[] = [];
	const gateway = {
		accept: vi.fn<InvitationGateway['accept']>(),
		preview: vi.fn<InvitationGateway['preview']>()
	};
	const onAccepted = vi.fn<(household: HouseholdSummary) => void>();
	const flow = new InvitationFlow({ gateway, onAccepted, onChange: (state) => states.push(state), store });

	store.save(TOKEN);

	return { flow, gateway, onAccepted, states, store };
}

const PREVIEW_OK: InvitationPreviewResult = { invitation: PREVIEW, ok: true };

describe('InvitationFlow preview', () => {
	it('shows the invitation of a live token', async () => {
		const { flow, gateway } = setup();

		gateway.preview.mockResolvedValue(PREVIEW_OK);
		await flow.load(TOKEN);

		expect(gateway.preview).toHaveBeenCalledExactlyOnceWith(TOKEN);
		expect(flow.state).toEqual({ kind: 'ready', preview: PREVIEW });
	});

	it('goes through loading first', async () => {
		const { flow, gateway, states } = setup();

		gateway.preview.mockResolvedValue(PREVIEW_OK);
		await flow.load(TOKEN);

		expect(states.map((state) => state.kind)).toEqual(['loading', 'ready']);
	});

	it.each(['expired', 'used', 'revoked', 'unknown'] as const)('tells the reason %s and forgets the token', async (reason) => {
		const { flow, gateway, store } = setup();

		gateway.preview.mockResolvedValue(unavailable(reason));
		await flow.load(TOKEN);

		expect(flow.state).toEqual({ cause: reason, kind: 'unavailable' });
		expect(store.read()).toBeUndefined();
	});

	it('keeps the general text for a dead link with no reason (an older API)', async () => {
		const { flow, gateway } = setup();

		gateway.preview.mockResolvedValue(unavailable());
		await flow.load(TOKEN);

		expect(flow.state).toEqual({ cause: 'unspecified', kind: 'unavailable' });
	});

	it('treats the older invitation-not-found like a dead link', async () => {
		const { flow, gateway } = setup();

		gateway.preview.mockResolvedValue(failure({ errorCode: 'invitation-not-found' }));
		await flow.load(TOKEN);

		expect(flow.state).toEqual({ cause: 'unspecified', kind: 'unavailable' });
	});

	it('reports a token the server finds malformed as a damaged link', async () => {
		const { flow, gateway, store } = setup();

		gateway.preview.mockResolvedValue(failure({ errorCode: 'invalid-input' }));
		await flow.load(TOKEN);

		expect(flow.state).toEqual({ cause: 'malformed', kind: 'unavailable' });
		expect(store.read()).toBeUndefined();
	});

	it('says the link is damaged without asking the server when the page has no token', async () => {
		const { flow, gateway } = setup();

		await flow.load(undefined);

		expect(gateway.preview).not.toHaveBeenCalled();
		expect(flow.state).toEqual({ cause: 'malformed', kind: 'unavailable' });
	});

	it('keeps the token through a network failure and a repeat finds the invitation', async () => {
		const { flow, gateway, store } = setup();

		gateway.preview.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await flow.load(TOKEN);

		expect(flow.state).toEqual({ kind: 'preview-failed', message: PREVIEW_NETWORK_MESSAGE, problem: 'network' });
		expect(store.read()).toBe(TOKEN);

		gateway.preview.mockResolvedValueOnce(PREVIEW_OK);
		await flow.retry();

		expect(gateway.preview).toHaveBeenLastCalledWith(TOKEN);
		expect(flow.state.kind).toBe('ready');
	});

	it('keeps the token when there are too many requests', async () => {
		const { flow, gateway, store } = setup();

		gateway.preview.mockResolvedValue(failure({ errorCode: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.' }));
		await flow.load(TOKEN);

		expect(flow.state).toEqual({
			kind: 'preview-failed',
			message: 'Слишком много попыток. Попробуйте позже.',
			problem: 'rate-limited'
		});
		expect(store.read()).toBe(TOKEN);
	});

	it('reports a server error that carries no contract body as unexpected', async () => {
		const { flow, gateway } = setup();

		gateway.preview.mockRejectedValue(new ApiHttpError(502, 'Bad gateway', '/api/invitations/preview'));
		await flow.load(TOKEN);

		expect(flow.state).toMatchObject({ kind: 'preview-failed', problem: 'unexpected' });
	});
});

async function readyFlow(): Promise<Setup> {
	const current = setup();

	current.gateway.preview.mockResolvedValue(PREVIEW_OK);
	await current.flow.load(TOKEN);

	return current;
}

describe('InvitationFlow accept', () => {
	it('joins as a member, patches the viewer once and forgets the token', async () => {
		const { flow, gateway, onAccepted, store } = await readyFlow();

		gateway.accept.mockResolvedValue({ household: JOINED, ok: true });
		await flow.accept(false);

		expect(gateway.accept).toHaveBeenCalledExactlyOnceWith(TOKEN, false);
		expect(flow.state).toEqual({ household: JOINED, kind: 'accepted' });
		expect(onAccepted).toHaveBeenCalledExactlyOnceWith(JOINED);
		expect(store.read()).toBeUndefined();
	});

	it('shows the running request between the confirmation and the result', async () => {
		const { flow, gateway, states } = await readyFlow();

		gateway.accept.mockResolvedValue({ household: JOINED, ok: true });
		await flow.accept(false);

		expect(states.map((state) => state.kind).slice(-2)).toEqual(['accepting', 'accepted']);
	});

	it('ignores a second press while the request runs', async () => {
		const { flow, gateway } = await readyFlow();
		let resolve: (result: AcceptInvitationResult) => void = () => {};

		gateway.accept.mockReturnValue(new Promise<AcceptInvitationResult>((done) => {
			resolve = done;
		}));

		const first = flow.accept(false);

		await flow.accept(false);
		resolve({ household: JOINED, ok: true });
		await first;

		expect(gateway.accept).toHaveBeenCalledTimes(1);
	});

	it('does nothing before the invitation is shown', async () => {
		const { flow, gateway } = setup();

		await flow.accept(false);

		expect(gateway.accept).not.toHaveBeenCalled();
	});

	it('refuses a person who is in another household and names it', async () => {
		const { flow, gateway, onAccepted, store } = await readyFlow();

		gateway.accept.mockResolvedValue(failure({ currentHousehold: { name: 'Дом' }, errorCode: 'already-in-household' }));
		await flow.accept(false);

		expect(flow.state).toEqual({ currentHouseholdName: 'Дом', kind: 'already-in-household', preview: PREVIEW });
		expect(onAccepted).not.toHaveBeenCalled();
		// The person may leave the other household and come back to the same link.
		expect(store.read()).toBe(TOKEN);
	});

	it('asks for consent to delete the own empty household and changes nothing before it', async () => {
		const { flow, gateway, onAccepted } = await readyFlow();

		gateway.accept.mockResolvedValue(failure({
			currentHousehold: { name: 'Дом' },
			errorCode: 'empty-household-confirmation-required'
		}));
		await flow.accept(false);

		expect(flow.state).toEqual({ currentHouseholdName: 'Дом', kind: 'confirm-replace', preview: PREVIEW });
		expect(onAccepted).not.toHaveBeenCalled();
	});

	it('repeats the request with replaceEmptyHousehold after the consent', async () => {
		const { flow, gateway, onAccepted, states } = await readyFlow();

		gateway.accept.mockResolvedValueOnce(failure({
			currentHousehold: { name: 'Дом' },
			errorCode: 'empty-household-confirmation-required'
		}));
		await flow.accept(false);

		gateway.accept.mockResolvedValueOnce({ household: JOINED, ok: true });
		await flow.accept(true);

		expect(gateway.accept).toHaveBeenNthCalledWith(1, TOKEN, false);
		expect(gateway.accept).toHaveBeenNthCalledWith(2, TOKEN, true);
		expect(flow.state).toEqual({ household: JOINED, kind: 'accepted' });
		expect(onAccepted).toHaveBeenCalledTimes(1);
		// While the consent request runs the page stays on the consent card.
		expect(states.find((state) => state.kind === 'accepting' && state.replacing !== undefined)).toMatchObject({
			replacing: { currentHouseholdName: 'Дом' }
		});
	});

	it('goes back to the consent card with the error when the consenting request fails', async () => {
		const { flow, gateway } = await readyFlow();

		gateway.accept.mockResolvedValueOnce(failure({
			currentHousehold: { name: 'Дом' },
			errorCode: 'empty-household-confirmation-required'
		}));
		await flow.accept(false);

		gateway.accept.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await flow.accept(true);

		expect(flow.state).toEqual({
			currentHouseholdName: 'Дом',
			error: ACCEPT_NETWORK_MESSAGE,
			kind: 'confirm-replace',
			preview: PREVIEW
		});
	});

	it('shows the banner of the board and lets the person repeat after a network failure', async () => {
		const { flow, gateway, onAccepted } = await readyFlow();

		gateway.accept.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await flow.accept(false);

		expect(flow.state).toEqual({ kind: 'accept-failed', message: ACCEPT_NETWORK_MESSAGE, preview: PREVIEW, problem: 'network' });

		gateway.accept.mockResolvedValueOnce({ household: JOINED, ok: true });
		await flow.accept(false);

		expect(flow.state.kind).toBe('accepted');
		expect(onAccepted).toHaveBeenCalledTimes(1);
	});

	it('reports too many attempts with the message of the server', async () => {
		const { flow, gateway, store } = await readyFlow();

		gateway.accept.mockResolvedValue(failure({ errorCode: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.' }));
		await flow.accept(false);

		expect(flow.state).toMatchObject({
			kind: 'accept-failed',
			message: 'Слишком много попыток. Попробуйте позже.',
			problem: 'rate-limited'
		});
		expect(store.read()).toBe(TOKEN);
	});

	it('learns at accept time that the link died meanwhile (the loser of two acceptances is told it is used)', async () => {
		const { flow, gateway, onAccepted, store } = await readyFlow();

		gateway.accept.mockResolvedValue(unavailable('used'));
		await flow.accept(false);

		expect(flow.state).toEqual({ cause: 'used', kind: 'unavailable' });
		expect(onAccepted).not.toHaveBeenCalled();
		expect(store.read()).toBeUndefined();
	});

	it('returns to the invitation when the session is gone', async () => {
		const { flow, gateway } = await readyFlow();

		gateway.accept.mockResolvedValue(failure({ errorCode: 'unauthenticated' }));
		await flow.accept(false);

		expect(flow.state).toEqual({ kind: 'ready', preview: PREVIEW });
	});

	it('forgets the token when the person dismisses the page', async () => {
		const { flow, store } = await readyFlow();

		flow.dismiss();

		expect(store.read()).toBeUndefined();
	});

	it('still patches the viewer for an accept that finished after the page was left', async () => {
		const { flow, gateway, onAccepted, states } = await readyFlow();
		let resolve: (result: AcceptInvitationResult) => void = () => {};

		gateway.accept.mockReturnValue(new Promise<AcceptInvitationResult>((done) => {
			resolve = done;
		}));

		const pending = flow.accept(false);
		const seen = states.length;

		flow.dispose();
		resolve({ household: JOINED, ok: true });
		await pending;

		// The household was joined on the server, so the viewer must know; the dead page shows nothing more.
		expect(onAccepted).toHaveBeenCalledExactlyOnceWith(JOINED);
		expect(states).toHaveLength(seen);
	});

	it('never puts the token into a state it reports', async () => {
		const { flow, gateway, states } = setup();

		gateway.preview.mockResolvedValueOnce(PREVIEW_OK);
		await flow.load(TOKEN);
		gateway.accept.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await flow.accept(false);
		gateway.accept.mockResolvedValueOnce({ household: JOINED, ok: true });
		await flow.accept(false);

		expect(JSON.stringify(states)).not.toContain(TOKEN);
	});
});

describe('describeUnavailable', () => {
	it('gives each cause its own text and icon', () => {
		const causes = ['expired', 'used', 'revoked', 'unknown', 'malformed', 'unspecified'] as const;
		const texts = causes.map((cause) => describeUnavailable(cause));

		expect(new Set(texts.map((view) => view.title)).size).toBe(texts.length);
		expect(describeUnavailable('expired')).toMatchObject({ icon: 'clock', title: 'Срок действия закончился' });
		expect(describeUnavailable('used')).toMatchObject({ icon: 'check', title: 'Ссылка уже использована' });
		expect(describeUnavailable('revoked')).toMatchObject({ icon: 'x', title: 'Приглашение отозвано' });
	});

	it('does not claim that a link nobody knows was mistyped, and asks for a new one', () => {
		const view = describeUnavailable('unknown');
		const text = `${view.title} ${view.description}`.toLowerCase();

		expect(text).not.toContain('ошибк');
		expect(text).not.toContain('набран');
		expect(text).not.toContain('скопировали');
		expect(view.description).toContain('нов');
	});

	it('keeps «скопировали ссылку целиком» for a link that is cut', () => {
		expect(describeUnavailable('malformed').description).toContain('скопировали ссылку целиком');
	});

	it('keeps the general text of the contract for a dead link with no reason', () => {
		expect(describeUnavailable('unspecified').description).toContain('Попросите новую');
	});
});

describe('describeInvitationScreen', () => {
	const ready: InvitationFlowState = { kind: 'ready', preview: PREVIEW };

	it('asks a guest to sign in and a signed-in person to confirm', () => {
		expect(describeInvitationScreen(ready, false)).toEqual({ kind: 'guest', preview: PREVIEW });
		expect(describeInvitationScreen(ready, true)).toEqual({ isAccepting: false, kind: 'confirm', preview: PREVIEW });
	});

	it('shows a dead link, the check and its failure the same way to everyone', () => {
		const dead: InvitationFlowState = { cause: 'revoked', kind: 'unavailable' };
		const failed: InvitationFlowState = { kind: 'preview-failed', message: 'm', problem: 'network' };

		for (const isSignedIn of [false, true]) {
			expect(describeInvitationScreen(dead, isSignedIn)).toEqual({ cause: 'revoked', kind: 'unavailable' });
			expect(describeInvitationScreen(failed, isSignedIn)).toEqual({ kind: 'preview-failed', message: 'm', problem: 'network' });
			expect(describeInvitationScreen({ kind: 'loading' }, isSignedIn)).toEqual({ kind: 'loading' });
		}
	});

	it('keeps a running plain request on the confirmation and a running consent on the consent card', () => {
		expect(describeInvitationScreen({ kind: 'accepting', preview: PREVIEW }, true))
			.toEqual({ isAccepting: true, kind: 'confirm', preview: PREVIEW });
		expect(describeInvitationScreen({ kind: 'accepting', preview: PREVIEW, replacing: { currentHouseholdName: 'Дом' } }, true))
			.toEqual({ currentHouseholdName: 'Дом', isAccepting: true, kind: 'replace', preview: PREVIEW });
	});

	it('puts the failure of a plain request on the confirmation and the consent card for the consent', () => {
		expect(describeInvitationScreen({ kind: 'accept-failed', message: 'm', preview: PREVIEW, problem: 'network' }, true))
			.toEqual({ isAccepting: false, kind: 'confirm', preview: PREVIEW, problem: { kind: 'network', message: 'm' } });
		expect(describeInvitationScreen({ currentHouseholdName: 'Дом', error: 'e', kind: 'confirm-replace', preview: PREVIEW }, true))
			.toEqual({ currentHouseholdName: 'Дом', error: 'e', isAccepting: false, kind: 'replace', preview: PREVIEW });
	});

	it('shows the refusal and the success to a signed-in person', () => {
		expect(describeInvitationScreen({ currentHouseholdName: 'Дом', kind: 'already-in-household', preview: PREVIEW }, true))
			.toEqual({ currentHouseholdName: 'Дом', kind: 'already-in-household' });
		expect(describeInvitationScreen({ household: JOINED, kind: 'accepted' }, true)).toEqual({ household: JOINED, kind: 'accepted' });
	});

	it('sends a guest back to the sign-in card whatever step the session loss interrupted', () => {
		const interrupted: InvitationFlowState[] = [
			{ kind: 'accepting', preview: PREVIEW },
			{ kind: 'accept-failed', message: 'm', preview: PREVIEW, problem: 'network' },
			{ currentHouseholdName: undefined, kind: 'confirm-replace', preview: PREVIEW },
			{ currentHouseholdName: undefined, kind: 'already-in-household', preview: PREVIEW }
		];

		for (const state of interrupted) {
			expect(describeInvitationScreen(state, false)).toEqual({ kind: 'guest', preview: PREVIEW });
		}
	});
});
