import { ApiHttpError } from '@/shared/api';

import type * as Viewer from '@/entities/viewer';
import { viewerFromSession } from '@/entities/viewer/model/viewer-access';

import type { SignInMethodsController } from '@/features/auth';
import { AuthClient } from '@/features/auth/api';
import {
	InvitationAlreadyCard,
	InvitationClient,
	InvitationGuestCard,
	InvitationUnavailableCard,
	pendingInvitation
} from '@/features/invitation';
import { resetTelegramCookieQueue, TELEGRAM_POLL_INTERVAL_MS } from '@/features/telegram-request';

import { InvitePage } from '@/views/invite/page';

import type { CurrentSessionResponse, InvitationKind } from '@i-finances/contracts';
import { Navigate } from '@solidjs/router';
import type * as Solid from 'solid-js';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const page = vi.hoisted(() => ({ viewer: null as Viewer.CurrentViewer | null }));

// Keep Solid's reactive controllers and page lifecycle in Node; replace only the rendered cards and routing.
vi.mock('solid-js', () => vi.importActual<typeof Solid>('solid-js/dist/solid.js'));
vi.mock('solid-js/web', async () => {
	const { createComponent } = await import('solid-js');

	return { createComponent };
});
vi.mock('@/shared/ui', async () => {
	const { children, createComputed } = await import('solid-js');

	return {
		PageCard: (props: { children: Solid.JSX.Element }) => {
			const content = children(() => props.children);

			createComputed(() => content());
			return null;
		}
	};
});
vi.mock('@/entities/viewer', async (importOriginal) => ({
	...await importOriginal<typeof Viewer>(),
	useCurrentViewer: () => () => page.viewer,
	useSetCurrentViewer: () => vi.fn()
}));
vi.mock('@/features/auth', async () => ({
	...await import('@/features/auth/model/create-sign-in-methods'),
	...await import('@/features/auth/model/save-display-name')
}));
vi.mock('@/features/invitation', async () => {
	const { PendingInvitationStore } = await import('@/features/invitation/model/pending-invitation-store');

	return {
		...await import('@/features/invitation/api/invitation-client'),
		...await import('@/features/invitation/model/claim-invitation-token'),
		...await import('@/features/invitation/model/describe-invitation-screen'),
		...await import('@/features/invitation/model/invitation-flow'),
		InvitationAcceptedCard: vi.fn(() => null),
		InvitationAlreadyCard: vi.fn(() => null),
		InvitationConfirmCard: vi.fn(() => null),
		InvitationGuestCard: vi.fn(() => null),
		InvitationLoadingCard: vi.fn(() => null),
		InvitationReplaceCard: vi.fn(() => null),
		InvitationUnavailableCard: vi.fn(() => null),
		pendingInvitation: new PendingInvitationStore(undefined)
	};
});
vi.mock('@solidjs/meta', () => ({ Title: () => null }));
vi.mock('@solidjs/router', () => ({
	Navigate: vi.fn(() => null),
	query: { clear: vi.fn() },
	useNavigate: () => vi.fn()
}));

const TOKEN = 'a'.repeat(43);

const CODE = 'A'.repeat(32);

const SESSION: Extract<CurrentSessionResponse, { authenticated: true }> = {
	authenticated: true,
	canCreateHousehold: true,
	hasPassword: false,
	household: null,
	telegram: { username: 'anna' },
	user: { displayName: 'Анна', id: 'new-user', username: 'tg-1' }
};

let disposePage: (() => void) | undefined;

function renderPage(client: AuthClient, onSignedIn = vi.fn()): void {
	disposePage?.();
	createRoot((dispose) => {
		disposePage = dispose;
		InvitePage({ authClient: client, onSignedIn });
	});
}

function guestController(): SignInMethodsController {
	const props = vi.mocked(InvitationGuestCard).mock.lastCall?.[0];

	if (props === undefined) {
		throw new Error('The page did not show the invitation guest card.');
	}

	return props.controller;
}

async function openInvitation(kind: InvitationKind) {
	const client = new AuthClient();
	const currentSession = vi.spyOn(client, 'currentSession').mockResolvedValue(SESSION);
	const complete = vi.spyOn(client, 'completeTelegramSignIn');
	const start = vi.spyOn(client, 'startTelegramSignIn').mockResolvedValue({
		appUrl: `tg://resolve?domain=bot&start=${CODE}`,
		botUrl: `https://t.me/bot?start=${CODE}`,
		code: CODE,
		expiresAt: new Date(Date.now() + 600_000).toISOString(),
		ok: true
	});
	const preview = vi.spyOn(InvitationClient.prototype, 'preview').mockResolvedValue({
		invitation: {
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
			...(kind === 'household' ? { householdName: 'Семья' } : {}),
			inviterName: 'Сергей',
			kind
		},
		ok: true
	});
	const onSignedIn = vi.fn();

	vi.spyOn(client, 'signOut').mockResolvedValue({ ok: true });
	pendingInvitation.save(TOKEN);
	renderPage(client, onSignedIn);
	await vi.advanceTimersByTimeAsync(0);

	return { client, complete, controller: guestController(), currentSession, onSignedIn, preview, start };
}

describe('invitation page sign-in', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetTelegramCookieQueue();
		page.viewer = null;
		pendingInvitation.clear();
		vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
		vi.stubGlobal('window', { location: { hash: '', pathname: '/invite' } });
	});

	afterEach(() => {
		disposePage?.();
		disposePage = undefined;
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it.each([
		['app', false],
		['app', true],
		['household', false],
		['household', true]
	] as const)('handles identity rejection for an %s invitation (first sign-in new: %s)',
		async (kind, firstIsNewUser) => {
			const { complete, controller, currentSession, onSignedIn, start } = await openInvitation(kind);

			currentSession.mockResolvedValue({ ...SESSION, user: { ...SESSION.user, id: 'wrong-user' } });
			complete.mockResolvedValue({ hasHousehold: false, isNewUser: firstIsNewUser, ok: true, status: 'confirmed' });
			controller.telegram.openTelegram();
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(controller.isConfirmed()).toBe(true);
			// A session-aware read claims a live token; rejecting this identity must release that binding.
			expect(pendingInvitation.read('wrong-user')).toBe(kind === 'app' && firstIsNewUser ? undefined : TOKEN);

			await controller.signOut();
			await vi.advanceTimersByTimeAsync(0);

			if (kind === 'app' && firstIsNewUser) {
				expect(pendingInvitation.read()).toBeUndefined();
				expect(pendingInvitation.registrationKind('wrong-user')).toBeUndefined();
				expect(start).toHaveBeenCalledExactlyOnceWith(TOKEN);
				expect(InvitationUnavailableCard).toHaveBeenCalledWith(expect.objectContaining({ cause: 'used-for-registration' }));
				return;
			}

			expect(pendingInvitation.read()).toBe(TOKEN);
			expect(start).toHaveBeenCalledTimes(2);
			expect(start.mock.calls).toEqual([[TOKEN], [TOKEN]]);

			currentSession.mockResolvedValue(SESSION);
			complete.mockResolvedValue({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });
			controller.telegram.openTelegram();
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
			expect(controller.isConfirmed()).toBe(true);
			expect(pendingInvitation.registrationKind(SESSION.user.id)).toBe(kind);
			expect(pendingInvitation.read(SESSION.user.id)).toBe(kind === 'household' ? TOKEN : undefined);

			controller.onSignedIn();
			expect(onSignedIn).toHaveBeenCalledOnce();
		});

	it('forgets the spent app token when the identity is still loading at sign-out', async () => {
		const { complete, controller, currentSession, start } = await openInvitation('app');

		currentSession.mockReturnValue(new Promise(() => {}));
		complete.mockResolvedValue({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });
		controller.telegram.openTelegram();
		await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
		expect(controller.isSessionLoading()).toBe(true);
		expect(pendingInvitation.read()).toBe(TOKEN);

		await controller.signOut();
		expect(pendingInvitation.read()).toBeUndefined();
		expect(start).toHaveBeenCalledOnce();
		expect(InvitationUnavailableCard).toHaveBeenCalledWith(expect.objectContaining({ cause: 'used-for-registration' }));
	});

	it('shows the spent-link card when rejecting a recovered app registration', async () => {
		const { complete, controller, start } = await openInvitation('app');

		complete
			.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
			.mockRejectedValueOnce(new ApiHttpError(410, {
				errorCode: 'login-expired',
				message: 'Заявка завершена.',
				ok: false
			}, '/api/auth/telegram/complete'));
		controller.telegram.openTelegram();
		await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 2);
		expect(controller.isConfirmed()).toBe(true);

		await controller.signOut();
		await vi.advanceTimersByTimeAsync(0);

		expect(pendingInvitation.read()).toBeUndefined();
		expect(pendingInvitation.registrationKind(SESSION.user.id)).toBeUndefined();
		expect(start).toHaveBeenCalledOnce();
		expect(InvitationUnavailableCard).toHaveBeenCalledWith(expect.objectContaining({ cause: 'used-for-registration' }));
	});

	it('keeps the confirmed registration when signing out fails and lets the person retry', async () => {
		const { client, complete, controller, start } = await openInvitation('app');

		complete.mockResolvedValue({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });
		controller.telegram.openTelegram();
		await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
		vi.mocked(client.signOut).mockRejectedValueOnce(new TypeError('Failed to fetch'));

		await expect(controller.signOut()).rejects.toThrow('Failed to fetch');
		expect(controller.isConfirmed()).toBe(true);
		expect(pendingInvitation.registrationKind(SESSION.user.id)).toBe('app');
		expect(InvitationUnavailableCard).not.toHaveBeenCalled();

		await controller.signOut();
		expect(start).toHaveBeenCalledOnce();
		expect(InvitationUnavailableCard).toHaveBeenCalledWith(expect.objectContaining({ cause: 'used-for-registration' }));
	});

	it('recovers a registration after a reload when preview says the token was used and the viewer may create a household', async () => {
		const client = new AuthClient();
		const preview = vi.spyOn(InvitationClient.prototype, 'preview').mockResolvedValue({
			errorCode: 'invitation-unavailable',
			message: 'Ссылка приглашения недействительна.',
			ok: false,
			reason: 'used'
		});
		const start = vi.spyOn(client, 'startTelegramSignIn');

		page.viewer = viewerFromSession(SESSION);
		pendingInvitation.save(TOKEN);
		renderPage(client);
		await vi.advanceTimersByTimeAsync(0);

		expect(preview).toHaveBeenCalledExactlyOnceWith(TOKEN);
		expect(Navigate).toHaveBeenCalledWith(expect.objectContaining({ href: '/onboarding' }));
		expect(InvitationUnavailableCard).not.toHaveBeenCalled();
		expect(start).not.toHaveBeenCalled();
		expect(pendingInvitation.read(SESSION.user.id)).toBeUndefined();
	});

	it.each([
		['guest', 'used'],
		['invitation-only', 'used'],
		['member', 'used'],
		['founder', 'expired'],
		['founder', 'revoked'],
		['founder', 'unknown']
	] as const)('keeps the unavailable card for a %s with a %s invitation', async (viewerKind, reason) => {
		const client = new AuthClient();

		vi.spyOn(InvitationClient.prototype, 'preview').mockResolvedValue({
			errorCode: 'invitation-unavailable',
			message: 'Ссылка приглашения недействительна.',
			ok: false,
			reason
		});
		page.viewer = viewerKind === 'guest' ? null : viewerFromSession({
			...SESSION,
			canCreateHousehold: viewerKind !== 'invitation-only',
			household: viewerKind === 'member' ? { id: 'household', name: 'Семья', role: 'owner' } : null
		});
		pendingInvitation.save(TOKEN);
		renderPage(client);
		await vi.advanceTimersByTimeAsync(0);

		expect(InvitationUnavailableCard).toHaveBeenCalledWith(expect.objectContaining({ cause: reason }));
		expect(Navigate).not.toHaveBeenCalled();
	});

	it.each(['login-expired', 'browser-mismatch'] as const)(
		'continues a recovered app registration to onboarding without previewing the spent invitation (%s)',
		async (errorCode) => {
			const { client, complete, controller, currentSession, onSignedIn, preview } = await openInvitation('app');

			complete
				.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
				.mockRejectedValueOnce(new ApiHttpError(errorCode === 'login-expired' ? 410 : 403, {
					errorCode,
					message: 'Заявка завершена.',
					ok: false
				}, '/api/auth/telegram/complete'));
			controller.telegram.openTelegram();
			await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS * 2);
			expect(controller.isConfirmed()).toBe(true);
			expect(currentSession).toHaveBeenCalledTimes(2);

			preview.mockResolvedValue({
				errorCode: 'invitation-unavailable',
				message: 'Ссылка приглашения недействительна.',
				ok: false,
				reason: 'used'
			});
			controller.onSignedIn();
			expect(onSignedIn).toHaveBeenCalledOnce();

			page.viewer = viewerFromSession(SESSION);
			renderPage(client);
			await vi.advanceTimersByTimeAsync(0);

			expect(Navigate).toHaveBeenCalledWith(expect.objectContaining({ href: '/onboarding' }));
			expect(preview).toHaveBeenCalledExactlyOnceWith(TOKEN);
			expect(pendingInvitation.registrationKind(SESSION.user.id)).toBe('app');
			expect(pendingInvitation.read(SESSION.user.id)).toBeUndefined();
		});

	it('keeps an ordinary existing app account without a household on the already-registered card', async () => {
		const { client, complete, controller, preview } = await openInvitation('app');

		complete.mockResolvedValue({ hasHousehold: false, isNewUser: false, ok: true, status: 'confirmed' });
		controller.telegram.openTelegram();
		await vi.advanceTimersByTimeAsync(TELEGRAM_POLL_INTERVAL_MS);
		controller.onSignedIn();
		page.viewer = viewerFromSession(SESSION);
		renderPage(client);
		await vi.advanceTimersByTimeAsync(0);

		expect(InvitationAlreadyCard).toHaveBeenCalledWith(expect.objectContaining({ invitationKind: 'app' }));
		expect(Navigate).not.toHaveBeenCalled();
		expect(preview).toHaveBeenCalledTimes(2);
		expect(pendingInvitation.registrationKind(SESSION.user.id)).toBeUndefined();
	});
});
