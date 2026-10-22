import { createTelegramLink } from '@/features/security/model/create-telegram-link';
import { TelegramLinkFlow } from '@/features/security/model/telegram-link-flow';
import type { TelegramLinkGateway } from '@/features/security/model/telegram-link-protocol';
import type { TelegramLinkConfirmed, TelegramLinkFailureReason } from '@/features/security/model/telegram-link-state';
import { createTelegramRequest, resetTelegramCookieQueue, TELEGRAM_LINK_REFRESH_MARGIN_MS } from '@/features/telegram-request';

import type * as Solid from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the page binding in Node: only Solid's mount/cleanup scheduling is replaced.
const lifecycle = vi.hoisted(() => ({ cleanups: [] as (() => void)[], mounts: [] as (() => void)[] }));

vi.mock('solid-js', async (importOriginal) => ({
	...await importOriginal<typeof Solid>(),
	onCleanup: (callback: () => void) => lifecycle.cleanups.push(callback),
	onMount: (callback: () => void) => lifecycle.mounts.push(callback)
}));

const TTL_MS = 10 * 60_000;

const CODE = 'A'.repeat(32);

function createGateway() {
	return {
		cancelTelegramLink: vi.fn<TelegramLinkGateway['cancelTelegramLink']>(async () => ({ ok: true })),
		completeTelegramLink: vi.fn<TelegramLinkGateway['completeTelegramLink']>(async () => ({ ok: true, status: 'pending' })),
		currentSession: vi.fn<TelegramLinkGateway['currentSession']>(async () => ({ authenticated: false })),
		startTelegramLink: vi.fn<TelegramLinkGateway['startTelegramLink']>(async () => ({
			appUrl: `tg://resolve?domain=bot&start=${CODE}`,
			botUrl: `https://t.me/bot?start=${CODE}`,
			code: CODE,
			expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
			ok: true
		}))
	};
}

function mount() {
	lifecycle.mounts.splice(0).forEach((callback) => callback());
}

function close() {
	lifecycle.cleanups.splice(0).forEach((callback) => callback());
}

describe('createTelegramLink page binding', () => {
	beforeEach(() => {
		resetTelegramCookieQueue();
		vi.useFakeTimers();
		vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
	});

	afterEach(() => {
		close();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('never starts on repeated opening, elapsed time or visibility changes before the press', async () => {
		const gateway = createGateway();

		for (let opening = 0; opening < 12; opening += 1) {
			const link = createTelegramLink(gateway, 'u');

			mount();
			document.dispatchEvent(new Event('visibilitychange'));
			await vi.advanceTimersByTimeAsync(TTL_MS * 2);
			expect(link.state()).toEqual({ kind: 'idle' });
			close();
		}

		expect(gateway.startTelegramLink).not.toHaveBeenCalled();
		expect(gateway.completeTelegramLink).not.toHaveBeenCalled();
		expect(gateway.cancelTelegramLink).not.toHaveBeenCalled();
		expect(gateway.currentSession).not.toHaveBeenCalled();
	});

	it('starts once on the press, refreshes the ready link only afterward, and stops refreshing on close', async () => {
		const gateway = createGateway();
		const link = createTelegramLink(gateway, 'u');

		mount();
		link.start();
		link.start();
		expect(link.state()).toEqual({ kind: 'preparing' });
		await vi.advanceTimersByTimeAsync(0);
		expect(link.state().kind).toBe('ready');
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(TTL_MS - TELEGRAM_LINK_REFRESH_MARGIN_MS - 1);
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(2);

		close();
		await vi.advanceTimersByTimeAsync(TTL_MS * 2);
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(2);
	});

	it('polls after opening the link, pauses when hidden, resumes when visible and stops on close', async () => {
		const gateway = createGateway();
		const link = createTelegramLink(gateway, 'u');

		mount();
		link.start();
		await vi.advanceTimersByTimeAsync(0);
		link.openTelegram();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(gateway.completeTelegramLink).toHaveBeenCalledExactlyOnceWith(CODE);

		Object.assign(document, { visibilityState: 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(10_000);
		expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(1);

		Object.assign(document, { visibilityState: 'visible' });
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(0);
		expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(2);

		close();
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(TTL_MS * 2);
		expect(gateway.completeTelegramLink).toHaveBeenCalledTimes(2);
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);
	});

	it('keeps automatic mount start as the default for existing callers such as sign-in', async () => {
		const gateway = createGateway();

		createTelegramRequest<TelegramLinkConfirmed, TelegramLinkFailureReason>((page) =>
			new TelegramLinkFlow({ gateway, userId: 'u', ...page }));
		mount();
		await vi.advanceTimersByTimeAsync(0);
		expect(gateway.startTelegramLink).toHaveBeenCalledTimes(1);
	});
});
