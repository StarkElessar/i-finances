import { ApiHttpError } from '@/shared/api';

import { TelegramLinkFlow } from '@/features/security/model/telegram-link-flow';
import type { TelegramLinkGateway } from '@/features/security/model/telegram-link-protocol';
import type { TelegramLinkState } from '@/features/security/model/telegram-link-state';
import { resetTelegramCookieQueue, TELEGRAM_POLL_INTERVAL_MS } from '@/features/telegram-request';

import {
	type CurrentSessionResponse,
	type TelegramLinkCompleteResult,
	type TelegramLinkErrorCode,
	telegramLinkErrorMessageByCode,
	type TelegramLinkStartResult
} from '@i-finances/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');

const TTL_MS = 10 * 60_000;

const CODE_A = 'A'.repeat(32);

const CODE_B = 'B'.repeat(32);

function startResult(code: string): Extract<TelegramLinkStartResult, { ok: true }> {
	return {
		appUrl: `tg://resolve?domain=i_finances_dev_bot&start=${code}`,
		botUrl: `https://t.me/i_finances_dev_bot?start=${code}`,
		code,
		expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
		ok: true
	};
}

function failure(status: number, errorCode: TelegramLinkErrorCode, retryAfterSeconds?: number): ApiHttpError {
	return new ApiHttpError(status, {
		errorCode,
		message: telegramLinkErrorMessageByCode[errorCode],
		ok: false
	}, '/api/auth/telegram/link', retryAfterSeconds);
}

const PENDING: TelegramLinkCompleteResult = { ok: true, status: 'pending' };

const LINKED: TelegramLinkCompleteResult = { ok: true, status: 'linked', telegram: { username: 'alexey' } };

function session(telegram: { username: string | null } | null, userId = 'u'): CurrentSessionResponse {
	return {
		authenticated: true,
		hasPassword: true,
		household: { id: 'h', name: 'Семья', role: 'owner' },
		telegram,
		user: { displayName: 'Сергей', id: userId, username: 'sergei' }
	};
}

function createHarness() {
	let visible = true;
	const states: TelegramLinkState[] = [];
	const codes = [CODE_A, CODE_B];
	const gateway = {
		cancelTelegramLink: vi.fn<TelegramLinkGateway['cancelTelegramLink']>(async () => ({ ok: true })),
		completeTelegramLink: vi.fn<TelegramLinkGateway['completeTelegramLink']>(async () => PENDING),
		currentSession: vi.fn<TelegramLinkGateway['currentSession']>(async () => ({ authenticated: false })),
		startTelegramLink: vi.fn<TelegramLinkGateway['startTelegramLink']>(async () => startResult(codes.shift() ?? CODE_B))
	};
	const flow = new TelegramLinkFlow({ gateway, isPageVisible: () => visible, onChange: (state) => states.push(state), userId: 'u' });

	return {
		flow,
		gateway,
		setVisible: (next: boolean) => {
			visible = next;
		},
		state: () => flow.getState(),
		states
	};
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

async function waitingHarness() {
	const harness = createHarness();

	harness.flow.start();
	await flush();
	expect(harness.state().kind).toBe('ready');
	harness.flow.handleLinkOpened();
	expect(harness.state().kind).toBe('waiting');

	return harness;
}

describe('TelegramLinkFlow', () => {
	beforeEach(() => {
		resetTelegramCookieQueue();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('start', () => {
		it('asks link/start once and offers the t.me link of the answer', async () => {
			const { flow, gateway, state } = createHarness();

			flow.start();
			flow.start();
			await flush();

			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);
			expect(state()).toMatchObject({
				kind: 'ready',
				link: { botUrl: `https://t.me/i_finances_dev_bot?start=${CODE_A}`, code: CODE_A }
			});
		});

		it.each([
			'https://evil.example/?start=abc',
			'http://t.me/i_finances_dev_bot',
			'javascript:alert(1)',
			'https://t.me.evil.example/x',
			'https://user@t.me/x',
			'https://t.me:8443/x'
		])('refuses %s as the link of the button', async (botUrl) => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockResolvedValue({ ...startResult(CODE_A), botUrl });
			flow.start();
			await flush();

			expect(state()).toMatchObject({ kind: 'failed', reason: 'unexpected' });
		});

		it('hides the block when Telegram is off on the server (404)', async () => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockRejectedValue(failure(404, 'telegram-unavailable'));
			flow.start();
			await flush();

			expect(state()).toEqual({ kind: 'unavailable' });
		});

		it('says the account already has a Telegram (409) without offering a retry', async () => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockRejectedValue(failure(409, 'account-has-telegram'));
			flow.start();
			await flush();

			expect(state()).toMatchObject({
				kind: 'failed',
				message: telegramLinkErrorMessageByCode['account-has-telegram'],
				reason: 'account-has-telegram'
			});
		});

		it('waits out a 429 and then starts again by itself, once', async () => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockRejectedValueOnce(failure(429, 'rate-limited', 90));
			flow.start();
			await flush();
			expect(state()).toMatchObject({ kind: 'failed', reason: 'rate-limited', retryAfterSeconds: 90 });

			await vi.advanceTimersByTimeAsync(89_000);
			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1_000);
			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(2);
			expect(state().kind).toBe('ready');
		});

		it('shows a network failure of start as a failure with the generic text', async () => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockRejectedValue(new TypeError('Failed to fetch'));
			flow.start();
			await flush();

			expect(state()).toMatchObject({
				kind: 'failed',
				message: telegramLinkErrorMessageByCode.unexpected,
				reason: 'network'
			});
		});
	});

	describe('the request cookie across flows', () => {
		it('starts a new flow only after the request of a closed one has settled, so a late answer cannot replace its cookie', async () => {
			const first = createHarness();
			let releaseFirst: () => void = () => undefined;

			first.gateway.startTelegramLink.mockImplementationOnce(() => new Promise((resolve) => {
				releaseFirst = () => resolve(startResult(CODE_A));
			}));
			first.flow.start();
			await flush();
			first.flow.dispose();

			const second = createHarness();

			second.flow.start();
			await flush();
			expect(second.gateway.startTelegramLink).not.toHaveBeenCalled();

			releaseFirst();
			await flush();
			expect(second.gateway.startTelegramLink).toHaveBeenCalledTimes(1);
			expect(second.state().kind).toBe('ready');
			expect(first.state().kind).toBe('preparing');
		});
	});

	describe('waiting', () => {
		it('polls link/complete with the code of its own start every 2 seconds, one request at a time', async () => {
			const { gateway } = await waitingHarness();
			let release: (value: TelegramLinkCompleteResult) => void = () => undefined;

			gateway.completeTelegramLink.mockImplementationOnce(() => new Promise((resolve) => {
				release = resolve;
			}));

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(gateway.completeTelegramLink).toHaveBeenCalledWith(CODE_A);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);

			release(PENDING);
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(2);
		});

		it('ends with the linked Telegram of the answer and stops polling', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockResolvedValueOnce(LINKED);
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toEqual({ kind: 'confirmed', telegram: { username: 'alexey' } });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);
		});

		it('keeps a Telegram without a username as null', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockResolvedValueOnce({ ok: true, status: 'linked', telegram: { username: null } });
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toEqual({ kind: 'confirmed', telegram: { username: null } });
		});

		it('pauses while the page is hidden and checks at once when it is visible again', async () => {
			const { flow, gateway, setVisible } = await waitingHarness();

			setVisible(false);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(gateway.completeTelegramLink).not.toHaveBeenCalled();

			setVisible(true);
			flow.handleVisibilityChange();
			await flush();
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);
		});

		it('stops on dispose: no more requests, no more states', async () => {
			const { flow, gateway, states } = await waitingHarness();
			const seen = states.length;

			flow.dispose();
			await vi.advanceTimersByTimeAsync(60_000);

			expect(gateway.completeTelegramLink).not.toHaveBeenCalled();
			expect(states).toHaveLength(seen);
		});

		it('stops at the request expiry on this browser clock', async () => {
			const { gateway, state } = await waitingHarness();

			await vi.advanceTimersByTimeAsync(TTL_MS + 3_000);

			expect(state()).toMatchObject({ kind: 'failed', reason: 'expired', message: telegramLinkErrorMessageByCode['link-expired'] });
			const calls = gateway.completeTelegramLink.mock.calls.length;

			await vi.advanceTimersByTimeAsync(30_000);
			expect(gateway.completeTelegramLink.mock.calls.length).toBe(calls);
		});

		it('cancels the request of its own code and prepares a new link', async () => {
			const { flow, gateway, state } = await waitingHarness();

			flow.cancel();
			await flush();

			expect(gateway.cancelTelegramLink).toHaveBeenCalledWith(CODE_A);
			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(2);
			expect(state()).toMatchObject({ kind: 'ready', link: { code: CODE_B } });
		});

		it('keeps asking through a lost connection and says so', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(state()).toMatchObject({ connectionLost: true, kind: 'waiting' });

			gateway.completeTelegramLink.mockResolvedValueOnce(PENDING);
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(state()).toMatchObject({ connectionLost: false, kind: 'waiting' });
		});

		it('obeys Retry-After of a 429 on a poll without giving up', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(failure(429, 'rate-limited', 20));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(state().kind).toBe('waiting');

			await vi.advanceTimersByTimeAsync(19_000);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1_000);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(2);
		});
	});

	describe('final failures', () => {
		it.each<[TelegramLinkErrorCode, number, string]>([
			['link-rejected', 410, 'rejected'],
			['link-expired', 410, 'expired'],
			['browser-mismatch', 403, 'browser-mismatch'],
			['telegram-linked-elsewhere', 409, 'linked-elsewhere'],
			['account-has-telegram', 409, 'account-has-telegram']
		])('ends on %s and keeps the contract text', async (errorCode, status, reason) => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(failure(status, errorCode));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toMatchObject({ kind: 'failed', message: telegramLinkErrorMessageByCode[errorCode], reason });
			await vi.advanceTimersByTimeAsync(30_000);
			expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);
		});

		it('does not restart by itself after browser-mismatch: the person starts over', async () => {
			const { flow, gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(failure(403, 'browser-mismatch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(60_000);
			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);

			flow.start();
			await flush();
			expect(gateway.startTelegramLink).toHaveBeenCalledTimes(2);
			expect(state().kind).toBe('ready');
		});
	});

	describe('a link whose answer was lost', () => {
		it.each<[TelegramLinkErrorCode, number]>([
			['browser-mismatch', 403],
			['link-expired', 410]
		])('finds the linked Telegram through the session after %s', async (errorCode, status) => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			gateway.completeTelegramLink.mockRejectedValueOnce(failure(status, errorCode));
			gateway.currentSession.mockResolvedValueOnce(session({ username: 'alexey' }));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(gateway.currentSession).toHaveBeenCalledTimes(1);
			expect(state()).toEqual({ kind: 'confirmed', telegram: { username: 'alexey' } });
		});

		it('keeps the failure when the session shows no Telegram', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			gateway.completeTelegramLink.mockRejectedValueOnce(failure(403, 'browser-mismatch'));
			gateway.currentSession.mockResolvedValueOnce(session(null));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toMatchObject({ kind: 'failed', reason: 'browser-mismatch' });
		});

		it('keeps the failure when the session is now another account (another tab signed in as someone else)', async () => {
			const { gateway, state, states } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			gateway.completeTelegramLink.mockRejectedValueOnce(failure(403, 'browser-mismatch'));
			gateway.currentSession.mockResolvedValueOnce(session({ username: 'someone_else' }, 'b'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(gateway.currentSession).toHaveBeenCalledTimes(1);
			expect(state()).toMatchObject({ kind: 'failed', reason: 'browser-mismatch' });
			expect(states.some((entry) => entry.kind === 'confirmed')).toBe(false);
		});

		it('keeps the failure when the session cannot be read either', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			gateway.completeTelegramLink.mockRejectedValueOnce(failure(410, 'link-expired'));
			gateway.currentSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toMatchObject({ kind: 'failed', reason: 'expired' });
		});

		it('shows the Telegram that was linked by an answer which came after the block was closed (start answers 409)', async () => {
			const closed = await waitingHarness();
			let answerLate: (result: TelegramLinkCompleteResult) => void = () => undefined;

			closed.gateway.completeTelegramLink.mockImplementationOnce(() => new Promise((resolve) => {
				answerLate = resolve;
			}));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			closed.flow.dispose();
			answerLate(LINKED);
			await flush();
			expect(closed.states.some((entry) => entry.kind === 'confirmed')).toBe(false);

			const reopened = createHarness();

			reopened.gateway.startTelegramLink.mockRejectedValueOnce(failure(409, 'account-has-telegram'));
			reopened.gateway.currentSession.mockResolvedValueOnce(session({ username: 'alexey' }));
			reopened.flow.start();
			await flush();

			expect(reopened.gateway.currentSession).toHaveBeenCalledTimes(1);
			expect(reopened.state()).toEqual({ kind: 'confirmed', telegram: { username: 'alexey' } });
		});

		it('asks the session on a 409 account-has-telegram of a poll too, without a lost answer', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(failure(409, 'account-has-telegram'));
			gateway.currentSession.mockResolvedValueOnce(session({ username: null }));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(state()).toEqual({ kind: 'confirmed', telegram: { username: null } });
		});

		it('keeps account-has-telegram when the session is another account', async () => {
			const { flow, gateway, state } = createHarness();

			gateway.startTelegramLink.mockRejectedValueOnce(failure(409, 'account-has-telegram'));
			gateway.currentSession.mockResolvedValueOnce(session({ username: 'someone_else' }, 'b'));
			flow.start();
			await flush();

			expect(state()).toMatchObject({ kind: 'failed', reason: 'account-has-telegram' });
		});

		it('never asks the session when no answer was lost: a plain 410 stays expired', async () => {
			const { gateway, state } = await waitingHarness();

			gateway.completeTelegramLink.mockRejectedValueOnce(failure(410, 'link-expired'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(gateway.currentSession).not.toHaveBeenCalled();
			expect(state()).toMatchObject({ kind: 'failed', reason: 'expired' });
		});
	});
});
