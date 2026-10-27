import type { CurrentViewer } from '@/entities/viewer';

import { resolveSessionChange } from '@/app/access/resolve-session-change';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

const VIEWER: CurrentViewer = {
	canCreateHousehold: false,
	isPlatformAdmin: false,
	displayName: 'Сергей',
	hasPassword: true,
	household: { id: 'household-1', name: 'Семья', role: 'owner' },
	id: 'user-1',
	telegram: null,
	username: 'sergei'
};

const SESSION: CurrentSessionResponse = {
	authenticated: true,
	hasPassword: VIEWER.hasPassword,
	household: VIEWER.household,
	telegram: VIEWER.telegram,
	user: { displayName: VIEWER.displayName, id: VIEWER.id, username: VIEWER.username }
};

describe('resolveSessionChange', () => {
	it('keeps the cache of the same user and adopts the updated viewer fields', () => {
		const session: CurrentSessionResponse = {
			...SESSION,
			hasPassword: false,
			telegram: { username: 'sergei_tg' },
			user: { ...SESSION.user, displayName: 'Сергей Иванов', username: 'sergei-ivanov' }
		};

		expect(resolveSessionChange(VIEWER, session)).toEqual({
			clearCache: false,
			viewer: { ...VIEWER, displayName: 'Сергей Иванов', hasPassword: false, telegram: session.telegram, username: 'sergei-ivanov' }
		});
	});

	it('drops the previous user cache when a different user signs in, even in the same household', () => {
		const session: CurrentSessionResponse = {
			...SESSION,
			user: { displayName: 'Анна', id: 'user-2', username: 'anna' }
		};

		expect(resolveSessionChange(VIEWER, session)).toEqual({
			clearCache: true,
			viewer: { ...VIEWER, displayName: 'Анна', id: 'user-2', username: 'anna' }
		});
	});

	it('clears the cache and adopts the viewer when a guest signs in', () => {
		expect(resolveSessionChange(null, SESSION)).toEqual({ clearCache: true, viewer: VIEWER });
	});

	it('clears the cache and forgets the viewer on sign-out', () => {
		expect(resolveSessionChange(VIEWER, { authenticated: false })).toEqual({ clearCache: true, viewer: null });
	});

	it('adopts a household for the same user without treating it as a different user', () => {
		expect(resolveSessionChange({ ...VIEWER, household: null }, SESSION)).toEqual({ clearCache: false, viewer: VIEWER });
	});

	it('does not clear the cache again after the new state has been adopted', () => {
		const signedIn = resolveSessionChange(null, SESSION);
		const signedOut = resolveSessionChange(signedIn.viewer, { authenticated: false });

		expect(resolveSessionChange(signedIn.viewer, SESSION)).toEqual({ clearCache: false, viewer: VIEWER });
		expect(resolveSessionChange(signedOut.viewer, { authenticated: false })).toEqual({ clearCache: false, viewer: null });
	});
});
