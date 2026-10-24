import { AuthClient } from '@/features/auth/api';

import type { SessionChange } from '@/app/access/resolve-session-change';
import { AppRouter } from '@/app/router';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { query } from '@solidjs/router';
import type * as Solid from 'solid-js';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SessionFetcher = (source: boolean, info: { value: SessionChange | undefined }) => Promise<SessionChange>;

const resource = vi.hoisted(() => ({ fetch: undefined as SessionFetcher | undefined }));

let disposeRouter: (() => void) | undefined;

// Exercise the router's session binding in Node without mounting the pages or scheduling a Solid resource.
vi.mock('solid-js', async (importOriginal) => ({
	...await importOriginal<typeof Solid>(),
	createResource: (fetcher: SessionFetcher) => {
		resource.fetch = fetcher;
		return [() => undefined, { refetch: vi.fn() }];
	}
}));

vi.mock('@solidjs/router', () => ({
	Navigate: () => null,
	query: { clear: vi.fn() },
	Route: () => null,
	Router: () => null
}));

vi.mock('@/features/auth', () => ({ SignInForm: () => null }));
vi.mock('@/features/invitation', () => ({ pendingInvitation: { clear: vi.fn() } }));
vi.mock('@/widgets/app-header', () => ({ AppHeader: () => null }));
vi.mock('@/views/categories/page', () => ({ CategoriesPage: () => null }));
vi.mock('@/views/contacts/page', () => ({ ContactsPage: () => null }));
vi.mock('@/views/home/page', () => ({ HomePage: () => null }));
vi.mock('@/views/invite/page', () => ({ InvitePage: () => null }));
vi.mock('@/views/onboarding/page', () => ({ OnboardingPage: () => null }));
vi.mock('@/views/receipts/page', () => ({ ReceiptsPage: () => null }));
vi.mock('@/views/statistics/page', () => ({ StatisticsPage: () => null }));

const SESSION: CurrentSessionResponse = {
	authenticated: true,
	hasPassword: true,
	household: { id: 'household-1', name: 'Семья', role: 'owner' },
	telegram: null,
	user: { displayName: 'Сергей', id: 'user-1', username: 'sergei' }
};

describe('router session changes', () => {
	afterEach(() => {
		disposeRouter?.();
		disposeRouter = undefined;
		vi.restoreAllMocks();
		resource.fetch = undefined;
	});

	it('clears cached queries before publishing a different viewer and keeps them for the same user', async () => {
		const client = new AuthClient();
		const currentSession = vi.spyOn(client, 'currentSession').mockResolvedValue(SESSION);
		const clearCache = vi.spyOn(query, 'clear').mockImplementation(() => {});

		createRoot((dispose) => {
			disposeRouter = dispose;
			AppRouter({ authClient: client });
		});

		const fetchSession = resource.fetch;

		if (fetchSession === undefined) {
			throw new Error('The router did not register its session resource.');
		}

		const initial = await fetchSession(true, { value: undefined });

		clearCache.mockClear();
		await fetchSession(true, { value: initial });
		expect(clearCache).not.toHaveBeenCalled();

		currentSession.mockResolvedValue({ ...SESSION, user: { displayName: 'Анна', id: 'user-2', username: 'anna' } });

		const changed = await fetchSession(true, { value: initial });

		expect(clearCache).toHaveBeenCalledTimes(1);
		expect(changed.viewer).toMatchObject({ displayName: 'Анна', id: 'user-2' });

		currentSession.mockResolvedValue({ authenticated: false });

		const signedOut = await fetchSession(true, { value: changed });

		expect(clearCache).toHaveBeenCalledTimes(2);
		expect(signedOut.viewer).toBeNull();
	});
});
