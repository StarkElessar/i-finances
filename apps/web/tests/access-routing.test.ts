import { applyHouseholdChange, type CurrentViewer, resolveViewerAccess, type ViewerAccess, viewerFromSession } from '@/entities/viewer';

import { applyAccessFailure } from '@/app/access/apply-access-failure';
import { ENTRY_PATH_BY_ACCESS, resolveRouteRedirect } from '@/app/access/route-redirect';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

const ACCESSES: readonly ViewerAccess[] = ['anonymous', 'onboarding', 'member'];

const MEMBER_SESSION: CurrentSessionResponse = {
	authenticated: true,
	hasPassword: true,
	household: { id: 'default-household', name: 'Семья', role: 'owner' },
	telegram: null,
	user: { displayName: 'Сергей', id: 'user-1', username: 'sergei' }
};

const ONBOARDING_SESSION: CurrentSessionResponse = {
	...MEMBER_SESSION,
	hasPassword: false,
	household: null,
	telegram: { username: 'anna_k' },
	user: { displayName: 'Анна', id: 'user-2', username: 'tg-100200300' }
};

function createEffects() {
	return {
		clearCache: vi.fn(),
		clearCurrentViewer: vi.fn(),
		rememberLostHousehold: vi.fn<(householdName: string) => void>(),
		setCurrentViewer: vi.fn<(patch: Partial<CurrentViewer>) => void>()
	};
}

describe('viewer access', () => {
	it('reads the access from the session', () => {
		expect(resolveViewerAccess(viewerFromSession({ authenticated: false }))).toBe('anonymous');
		expect(resolveViewerAccess(viewerFromSession(ONBOARDING_SESSION))).toBe('onboarding');
		expect(resolveViewerAccess(viewerFromSession(MEMBER_SESSION))).toBe('member');
		expect(resolveViewerAccess(undefined)).toBe('anonymous');
	});

	it('keeps the household of the session in the viewer', () => {
		expect(viewerFromSession(MEMBER_SESSION)).toEqual({
			displayName: 'Сергей',
			household: { id: 'default-household', name: 'Семья', role: 'owner' },
			id: 'user-1',
			username: 'sergei'
		});
	});
});

describe('route redirects', () => {
	it.each([
		// Route of the page, access of the viewer, where they go.
		['member', 'anonymous', '/sign-in'],
		['member', 'onboarding', '/onboarding'],
		['member', 'member', null],
		['onboarding', 'anonymous', '/sign-in'],
		['onboarding', 'onboarding', null],
		['onboarding', 'member', '/'],
		['anonymous', 'anonymous', null],
		['anonymous', 'onboarding', '/onboarding'],
		['anonymous', 'member', '/']
	] as const)('a %s route sends a viewer with %s access to %s', (route, access, expected) => {
		expect(resolveRouteRedirect(route, access)).toBe(expected);
	});

	it('never chains or loops: the target of a redirect keeps the viewer', () => {
		for (const route of ACCESSES) {
			for (const access of ACCESSES) {
				const target = resolveRouteRedirect(route, access);

				if (target === null) {
					continue;
				}

				const targetRoute = ACCESSES.find((candidate) => ENTRY_PATH_BY_ACCESS[candidate] === target);

				expect(targetRoute).toBe(access);
				expect(resolveRouteRedirect(access, access)).toBeNull();
			}
		}
	});

	it('keeps everyone on a route for any access: the invitation page', () => {
		for (const access of ACCESSES) {
			expect(resolveRouteRedirect('any', access)).toBeNull();
			expect(resolveRouteRedirect('any', access, { hasPendingInvitation: true })).toBeNull();
		}
	});

	it('leads a person who has just signed in back to the invitation that waits in the tab', () => {
		expect(resolveRouteRedirect('anonymous', 'onboarding', { hasPendingInvitation: true })).toBe('/invite');
		expect(resolveRouteRedirect('anonymous', 'member', { hasPendingInvitation: true })).toBe('/invite');
		// Without a waiting token the entry page of the access, as before.
		expect(resolveRouteRedirect('anonymous', 'onboarding', { hasPendingInvitation: false })).toBe('/onboarding');
		expect(resolveRouteRedirect('anonymous', 'member')).toBe('/');
	});

	it('does not take the invitation into account on any other route', () => {
		expect(resolveRouteRedirect('onboarding', 'member', { hasPendingInvitation: true })).toBe('/');
		expect(resolveRouteRedirect('member', 'onboarding', { hasPendingInvitation: true })).toBe('/onboarding');
		expect(resolveRouteRedirect('member', 'anonymous', { hasPendingInvitation: true })).toBe('/sign-in');
	});

	it('shows a finance page to a member only', () => {
		const allowed = ACCESSES.filter((access) => resolveRouteRedirect('member', access) === null);

		expect(allowed).toEqual(['member']);
	});
});

describe('applyAccessFailure', () => {
	it('drops the household on 403 household-required, in place and once', () => {
		const effects = createEffects();
		const viewer = viewerFromSession(MEMBER_SESSION);

		applyAccessFailure('household-required', viewer, effects);

		expect(effects.setCurrentViewer).toHaveBeenCalledWith({ household: null });
		expect(effects.clearCache).toHaveBeenCalledTimes(1);
		expect(effects.clearCurrentViewer).not.toHaveBeenCalled();
		expect(effects.rememberLostHousehold).toHaveBeenCalledExactlyOnceWith('Семья');

		// The next requests of the same page fail the same way, after the patch.
		applyAccessFailure('household-required', viewerFromSession(ONBOARDING_SESSION), effects);
		expect(effects.setCurrentViewer).toHaveBeenCalledTimes(1);
		expect(effects.rememberLostHousehold).toHaveBeenCalledTimes(1);
	});

	it('remembers the household a removed member lost with the 401 that ends their session (Р7)', () => {
		const effects = createEffects();

		applyAccessFailure('unauthenticated', viewerFromSession(MEMBER_SESSION), effects);

		expect(effects.rememberLostHousehold).toHaveBeenCalledExactlyOnceWith('Семья');
		expect(effects.clearCurrentViewer).toHaveBeenCalledTimes(1);
	});

	it('forgets the viewer on 401', () => {
		const effects = createEffects();

		applyAccessFailure('unauthenticated', viewerFromSession(ONBOARDING_SESSION), effects);

		expect(effects.clearCurrentViewer).toHaveBeenCalledTimes(1);
		expect(effects.clearCache).toHaveBeenCalledTimes(1);
		expect(effects.setCurrentViewer).not.toHaveBeenCalled();
		// Nobody to remember: this user had no household.
		expect(effects.rememberLostHousehold).not.toHaveBeenCalled();
	});

	it('does nothing for a guest: a failed password sign-in is a 401 too', () => {
		const effects = createEffects();

		applyAccessFailure('unauthenticated', null, effects);
		applyAccessFailure('household-required', null, effects);

		expect(effects.clearCurrentViewer).not.toHaveBeenCalled();
		expect(effects.setCurrentViewer).not.toHaveBeenCalled();
		expect(effects.clearCache).not.toHaveBeenCalled();
		expect(effects.rememberLostHousehold).not.toHaveBeenCalled();
	});
});

describe('applyHouseholdChange', () => {
	it('drops the cache before the viewer moves to another household, without a session refetch (review of U4)', () => {
		const calls: string[] = [];
		const household = { id: 'family', name: 'Семья', role: 'member' as const };

		applyHouseholdChange(household, {
			clearCache: () => calls.push('clear-cache'),
			setCurrentViewer: (patch) => calls.push(`patch:${JSON.stringify(patch)}`)
		});

		expect(calls).toEqual(['clear-cache', `patch:${JSON.stringify({ household })}`]);
	});

	it('drops the cache when the viewer leaves the household too', () => {
		const calls: string[] = [];

		applyHouseholdChange(null, {
			clearCache: () => calls.push('clear-cache'),
			setCurrentViewer: (patch) => calls.push(`patch:${JSON.stringify(patch)}`)
		});

		expect(calls).toEqual(['clear-cache', 'patch:{"household":null}']);
	});
});
