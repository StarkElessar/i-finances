import { ApiHttpError } from '@/shared/api';

import { TelegramSignInFlow, type TelegramSignInGateway } from '@/features/auth/model/telegram-sign-in-flow';
import type { TelegramSignInState } from '@/features/auth/model/telegram-sign-in-state';
import { resetTelegramCookieQueue, TELEGRAM_LINK_REFRESH_MARGIN_MS, TELEGRAM_POLL_INTERVAL_MS } from '@/features/telegram-request';

import {
	type TelegramSignInCompleteResult,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode,
	type TelegramSignInStartResult
} from '@i-finances/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');

const TTL_MS = 10 * 60_000;

const CODE_A = 'A'.repeat(32);

const CODE_B = 'B'.repeat(32);

function startResult(code: string, now = Date.now()): Extract<TelegramSignInStartResult, { ok: true }> {
	return {
		appUrl: `tg://resolve?domain=i_finances_dev_bot&start=${code}`,
		botUrl: `https://t.me/i_finances_dev_bot?start=${code}`,
		code,
		expiresAt: new Date(now + TTL_MS).toISOString(),
		ok: true
	};
}

function failure(status: number, errorCode: TelegramSignInErrorCode, retryAfterSeconds?: number): ApiHttpError {
	return new ApiHttpError(status, {
		errorCode,
		message: telegramSignInErrorMessageByCode[errorCode],
		ok: false
	}, '/api/auth/telegram', retryAfterSeconds);
}

const PENDING: TelegramSignInCompleteResult = { ok: true, status: 'pending' };

type Harness = {
	flow: TelegramSignInFlow;
	gateway: {
		cancelTelegramSignIn: ReturnType<typeof vi.fn<TelegramSignInGateway['cancelTelegramSignIn']>>;
		completeTelegramSignIn: ReturnType<typeof vi.fn<TelegramSignInGateway['completeTelegramSignIn']>>;
		currentSession: ReturnType<typeof vi.fn<TelegramSignInGateway['currentSession']>>;
		startTelegramSignIn: ReturnType<typeof vi.fn<TelegramSignInGateway['startTelegramSignIn']>>;
	};
	setVisible: (visible: boolean) => void;
	state: () => TelegramSignInState;
	states: TelegramSignInState[];
};

function createHarness(invitationToken?: string): Harness {
	let visible = true;
	const states: TelegramSignInState[] = [];
	const codes = [CODE_A, CODE_B];
	const gateway = {
		cancelTelegramSignIn: vi.fn<TelegramSignInGateway['cancelTelegramSignIn']>(async () => ({ ok: true })),
		completeTelegramSignIn: vi.fn<TelegramSignInGateway['completeTelegramSignIn']>(async () => PENDING),
		currentSession: vi.fn<TelegramSignInGateway['currentSession']>(async () => ({ authenticated: false })),
		startTelegramSignIn: vi.fn<TelegramSignInGateway['startTelegramSignIn']>(async () => startResult(codes.shift() ?? CODE_B))
	};
	const flow = new TelegramSignInFlow({
		gateway,
		invitationToken,
		isPageVisible: () => visible,
		onChange: (state) => states.push(state)
	});

	return {
		flow,
		gateway,
		setVisible: (next) => {
			visible = next;
		},
		state: () => flow.getState(),
		states
	};
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

async function readyHarness(): Promise<Harness> {
	const harness = createHarness();

	harness.flow.start();
	await flush();
	expect(harness.state().kind).toBe('ready');

	return harness;
}

async function waitingHarness(): Promise<Harness> {
	const harness = await readyHarness();

	harness.flow.handleLinkOpened();
	expect(harness.state().kind).toBe('waiting');

	return harness;
}

describe('TelegramSignInFlow', () => {
	beforeEach(() => {
		resetTelegramCookieQueue();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('start', () => {
		it('keeps ordinary sign-in free of invitation arguments', async () => {
			const harness = await readyHarness();

			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledExactlyOnceWith();
		});

		it('passes the invitation token on every start and never exposes it in a state', async () => {
			const token = 'a'.repeat(43);
			const harness = createHarness(token);

			harness.flow.start();
			await flush();
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledExactlyOnceWith(token);

			harness.flow.start();
			await flush();

			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenLastCalledWith(token);
			expect(JSON.stringify(harness.states)).not.toContain(token);
		});

		it('prepares the link once and keeps the code of its own answer', async () => {
			const harness = createHarness();

			harness.flow.start();
			harness.flow.start();
			expect(harness.state()).toEqual({ kind: 'preparing' });
			await flush();

			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
			expect(harness.state()).toEqual({
				kind: 'ready',
				link: {
					appUrl: `tg://resolve?domain=i_finances_dev_bot&start=${CODE_A}`,
					botUrl: `https://t.me/i_finances_dev_bot?start=${CODE_A}`,
					code: CODE_A,
					expiresAtMs: NOW + TTL_MS,
					ttlMinutes: 10
				}
			});
			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();
		});

		it('never starts twice at a time, also while the answer of start is on its way', async () => {
			const harness = createHarness();
			let answer: (result: TelegramSignInStartResult) => void = () => {};

			harness.gateway.startTelegramSignIn.mockImplementationOnce(() => new Promise((resolve) => {
				answer = resolve;
			}));
			harness.flow.start();
			await flush();
			harness.flow.start();
			await flush();
			answer(startResult(CODE_A));
			await flush();

			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
			expect(harness.state()).toMatchObject({ kind: 'ready', link: { code: CODE_A } });
		});

		it('refuses a bot link that is not https://t.me', async () => {
			const harness = createHarness();

			harness.gateway.startTelegramSignIn.mockResolvedValueOnce({
				...startResult(CODE_A),
				botUrl: 'javascript:alert(1)//https://t.me/i_finances_dev_bot'
			});
			harness.flow.start();
			await flush();

			expect(harness.state()).toMatchObject({ kind: 'failed', reason: 'unexpected' });
		});

		it.each([
			['ahead of the server by 11 minutes', NOW - 60_000],
			['behind the server by a day', NOW + 24 * 60 * 60_000]
		])('keeps one link for the default lifetime when the browser clock is %s', async (_clock, expiresAtMs) => {
			const harness = createHarness();

			harness.gateway.startTelegramSignIn.mockResolvedValueOnce({
				...startResult(CODE_A),
				expiresAt: new Date(expiresAtMs).toISOString()
			});
			harness.flow.start();
			await flush();

			expect(harness.state()).toMatchObject({ kind: 'ready', link: { expiresAtMs: NOW + TTL_MS, ttlMinutes: 10 } });

			await vi.advanceTimersByTimeAsync(TTL_MS - TELEGRAM_LINK_REFRESH_MARGIN_MS - 1);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
		});

		it('hides Telegram when the server has it switched off', async () => {
			const harness = createHarness();

			harness.gateway.startTelegramSignIn.mockRejectedValueOnce(failure(404, 'telegram-unavailable'));
			harness.flow.start();
			await flush();

			expect(harness.state()).toEqual({ kind: 'unavailable' });
		});

		it('waits for Retry-After after a 429 and then prepares the link by itself', async () => {
			const harness = createHarness();

			harness.gateway.startTelegramSignIn.mockRejectedValueOnce(failure(429, 'rate-limited', 120));
			harness.flow.start();
			await flush();

			expect(harness.state()).toMatchObject({ kind: 'failed', reason: 'rate-limited', retryAfterSeconds: 120 });

			await vi.advanceTimersByTimeAsync(119_000);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1_000);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
			expect(harness.state().kind).toBe('ready');
		});

		it('reports a network failure and starts again only on request', async () => {
			const harness = createHarness();

			harness.gateway.startTelegramSignIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			harness.flow.start();
			await flush();

			expect(harness.state()).toMatchObject({ kind: 'failed', reason: 'network' });

			await vi.advanceTimersByTimeAsync(TTL_MS);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);

			harness.flow.start();
			await flush();
			expect(harness.state().kind).toBe('ready');
		});

		it('replaces a ready link shortly before it expires', async () => {
			const harness = await readyHarness();

			await vi.advanceTimersByTimeAsync(TTL_MS - TELEGRAM_LINK_REFRESH_MARGIN_MS - 1);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
			expect(harness.state()).toMatchObject({ kind: 'ready', link: { code: CODE_B } });
		});

		it('replaces a link that expired while the page was hidden only when the page is visible again', async () => {
			const harness = await readyHarness();

			harness.setVisible(false);
			await vi.advanceTimersByTimeAsync(TTL_MS);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);

			harness.setVisible(true);
			harness.flow.handleVisibilityChange();
			await flush();
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
		});
	});

	describe('polling', () => {
		it('does not poll before the link is pressed', async () => {
			const harness = await readyHarness();

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 5);

			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();
		});

		it('polls every 2 seconds with the code of its own start', async () => {
			const harness = await waitingHarness();

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS - 1);
			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenLastCalledWith(CODE_A);

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 3);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(4);
		});

		it('keeps one request at a time when the server is slow', async () => {
			const harness = await waitingHarness();
			let resolveSlow: (value: TelegramSignInCompleteResult) => void = () => {};

			harness.gateway.completeTelegramSignIn.mockImplementationOnce(() => new Promise((resolve) => {
				resolveSlow = resolve;
			}));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);

			harness.flow.handleVisibilityChange();
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 5);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);

			resolveSlow(PENDING);
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(2);
		});

		it('pauses while the page is hidden and checks at once when it is visible again', async () => {
			const harness = await waitingHarness();

			harness.setVisible(false);
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 10);
			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();

			harness.setVisible(true);
			harness.flow.handleVisibilityChange();
			await flush();
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);
		});

		it('stays under the complete limit (300 per 5 minutes) over the whole request lifetime', async () => {
			const harness = await waitingHarness();
			const fiveMinutes = 5 * 60_000;

			await vi.advanceTimersByTimeAsync(fiveMinutes);
			const inFirstWindow = harness.gateway.completeTelegramSignIn.mock.calls.length;

			await vi.advanceTimersByTimeAsync(TTL_MS);
			const total = harness.gateway.completeTelegramSignIn.mock.calls.length;

			expect(inFirstWindow).toBeLessThanOrEqual(fiveMinutes / TELEGRAM_POLL_INTERVAL_MS);
			expect(total).toBeLessThanOrEqual(TTL_MS / TELEGRAM_POLL_INTERVAL_MS + 1);
			expect(harness.state()).toMatchObject({ kind: 'failed', reason: 'expired', ttlMinutes: 10 });
		});

		it('stops on confirmation', async () => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn.mockResolvedValueOnce({
				hasHousehold: false,
				isNewUser: true,
				ok: true,
				status: 'confirmed'
			});
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(harness.state()).toEqual({ hasHousehold: false, isNewUser: true, kind: 'confirmed' });

			await vi.advanceTimersByTimeAsync(TTL_MS * 2);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
		});

		it.each([
			[410, 'login-expired', 'expired'],
			[410, 'login-rejected', 'rejected'],
			[403, 'browser-mismatch', 'browser-mismatch'],
			[403, 'registration-closed', 'registration-closed'],
			[403, 'account-disabled', 'account-disabled'],
			[403, 'invalid-origin', 'unexpected']
		] as const)('stops on %i %s', async (status, errorCode, reason) => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn.mockRejectedValueOnce(failure(status, errorCode));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(harness.state()).toMatchObject({ kind: 'failed', reason });

			await vi.advanceTimersByTimeAsync(TTL_MS * 2);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);
			// A second tab that took the cookie must not be fought back automatically.
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
		});

		it('keeps waiting through a lost connection and says so', async () => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.state()).toMatchObject({ connectionLost: true, kind: 'waiting' });

			harness.gateway.completeTelegramSignIn.mockRejectedValueOnce(new ApiHttpError(502, '<html>', '/api'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.state()).toMatchObject({ connectionLost: true, kind: 'waiting' });

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.state()).toMatchObject({ connectionLost: false, kind: 'waiting' });
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(3);
		});

		it.each([
			[410, 'login-expired'],
			[403, 'browser-mismatch']
		] as const)('finds a confirmation whose answer was lost: %i %s after a poll without an answer', async (status, errorCode) => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn
				.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
				.mockRejectedValueOnce(failure(status, errorCode));
			harness.gateway.currentSession.mockResolvedValueOnce({
				authenticated: true,
				hasPassword: false,
				household: null,
				telegram: { username: 'anna_k' },
				user: { displayName: 'Анна', id: 'user-1', username: 'tg_1' }
			});
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 2);

			expect(harness.gateway.currentSession).toHaveBeenCalledTimes(1);
			expect(harness.state()).toEqual({ hasHousehold: false, isNewUser: false, isRecovered: true, kind: 'confirmed' });
		});

		it('says expired after a lost answer when there is no session, and does not ask without a lost answer', async () => {
			const lost = await waitingHarness();

			lost.gateway.completeTelegramSignIn
				.mockRejectedValueOnce(new TypeError('Failed to fetch'))
				.mockRejectedValueOnce(failure(410, 'login-expired'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 2);

			expect(lost.gateway.currentSession).toHaveBeenCalledTimes(1);
			expect(lost.state()).toMatchObject({ kind: 'failed', reason: 'expired' });

			const plain = await waitingHarness();

			plain.gateway.completeTelegramSignIn.mockRejectedValueOnce(failure(410, 'login-expired'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			expect(plain.gateway.currentSession).not.toHaveBeenCalled();
			expect(plain.state()).toMatchObject({ kind: 'failed', reason: 'expired' });
		});

		it('slows down after a 429 of complete instead of stopping', async () => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn.mockRejectedValueOnce(failure(429, 'rate-limited', 20));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(harness.state().kind).toBe('waiting');

			await vi.advanceTimersByTimeAsync(19_000);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1_000);
			expect(harness.gateway.completeTelegramSignIn).toHaveBeenCalledTimes(2);
		});
	});

	describe('cancel, restart and dispose', () => {
		it('cancels the request before starting a new one, so the old cookie is cleared first', async () => {
			const harness = await waitingHarness();
			const order: string[] = [];
			let resolveCancel: () => void = () => {};

			harness.gateway.cancelTelegramSignIn.mockImplementationOnce((code) => new Promise((resolve) => {
				order.push(`cancel ${code.slice(0, 1)}`);
				resolveCancel = () => resolve({ ok: true });
			}));
			harness.gateway.startTelegramSignIn.mockImplementationOnce(async () => {
				order.push('start');

				return startResult(CODE_B);
			});

			harness.flow.cancel();
			await flush();
			expect(harness.state()).toEqual({ kind: 'preparing' });
			expect(order).toEqual(['cancel A']);

			resolveCancel();
			await flush();
			expect(order).toEqual(['cancel A', 'start']);
			expect(harness.state()).toMatchObject({ kind: 'ready', link: { code: CODE_B } });

			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 3);
			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();
		});

		it('does not start while a poll is in flight: its answer may clear the cookie', async () => {
			const harness = await waitingHarness();
			let rejectPoll: (error: unknown) => void = () => {};

			harness.gateway.completeTelegramSignIn.mockImplementationOnce(() => new Promise((_resolve, reject) => {
				rejectPoll = reject;
			}));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);

			harness.flow.cancel();
			await flush();
			expect(harness.gateway.cancelTelegramSignIn).not.toHaveBeenCalled();
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);

			rejectPoll(failure(410, 'login-expired'));
			await flush();
			expect(harness.gateway.cancelTelegramSignIn).toHaveBeenCalledWith(CODE_A);
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
			// The late answer of the old request does not overwrite the new state.
			expect(harness.state()).toMatchObject({ kind: 'ready', link: { code: CODE_B } });
		});

		it('starts again from a failure on request', async () => {
			const harness = await waitingHarness();

			harness.gateway.completeTelegramSignIn.mockRejectedValueOnce(failure(403, 'browser-mismatch'));
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			harness.flow.start();
			await flush();

			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(2);
			expect(harness.state()).toMatchObject({ kind: 'ready', link: { code: CODE_B } });
		});

		it('stops every timer and ignores late answers after dispose', async () => {
			const harness = await waitingHarness();
			const statesBefore = harness.states.length;

			harness.flow.dispose();
			harness.flow.handleVisibilityChange();
			harness.flow.start();
			await vi.advanceTimersByTimeAsync(TTL_MS * 2);

			expect(harness.gateway.completeTelegramSignIn).not.toHaveBeenCalled();
			expect(harness.gateway.startTelegramSignIn).toHaveBeenCalledTimes(1);
			expect(harness.states).toHaveLength(statesBefore);
		});
	});
});
