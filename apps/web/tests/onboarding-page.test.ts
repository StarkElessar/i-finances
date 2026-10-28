import type * as Viewer from '@/entities/viewer';

import { AuthClient } from '@/features/auth/api';
import { OnboardingCreateCard, OnboardingWelcomeCard } from '@/features/household';
import { pendingInvitation } from '@/features/invitation';

import { OnboardingPage } from '@/views/onboarding/page';

import type * as Solid from 'solid-js';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const page = vi.hoisted(() => ({ viewer: null as Viewer.CurrentViewer | null }));

vi.mock('solid-js', () => vi.importActual<typeof Solid>('solid-js/dist/solid.js'));
vi.mock('solid-js/web', async () => {
	const { createComponent, createMemo } = await import('solid-js');

	return { createComponent, memo: createMemo };
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
vi.mock('@/entities/viewer', () => ({
	householdLossNotice: { read: () => undefined },
	useCurrentViewer: () => () => page.viewer,
	useSetCurrentViewer: () => vi.fn()
}));
vi.mock('@/features/auth', () => import('@/features/auth/model/save-display-name'));
vi.mock('@/features/household', async () => ({
	...await import('@/features/household/api/household-client'),
	...await import('@/features/household/model/create-household'),
	...await import('@/features/household/model/read-welcome-form'),
	OnboardingCreateCard: vi.fn(() => null),
	OnboardingWelcomeCard: vi.fn(() => null)
}));
vi.mock('@/features/invitation', async () => {
	const { PendingInvitationStore } = await import('@/features/invitation/model/pending-invitation-store');

	return {
		...await import('@/features/invitation/model/parse-invitation-link'),
		pendingInvitation: new PendingInvitationStore(undefined)
	};
});
vi.mock('@solidjs/meta', () => ({ Title: () => null }));
vi.mock('@solidjs/router', () => ({ useNavigate: () => vi.fn() }));

const TOKEN = 'a'.repeat(43);

let disposePage: (() => void) | undefined;

function renderPage(): void {
	createRoot((dispose) => {
		disposePage = dispose;
		OnboardingPage({ authClient: new AuthClient(), onSignedOut: vi.fn() });
	});
}

describe('onboarding page registration context', () => {
	beforeEach(() => {
		page.viewer = {
			canCreateHousehold: false,
			displayName: 'Анна',
			hasPassword: false,
			household: null,
			id: 'new-user',
			telegram: { username: 'anna' },
			username: 'tg-1'
		};
		pendingInvitation.clear();
		pendingInvitation.save(TOKEN);
	});

	afterEach(() => {
		disposePage?.();
		disposePage = undefined;
		vi.clearAllMocks();
	});

	it('shows the ordinary welcome for an app registration without the right to create a household', () => {
		pendingInvitation.markRegistered(TOKEN, 'app', page.viewer?.id);
		renderPage();

		expect(OnboardingWelcomeCard).toHaveBeenCalledWith(expect.objectContaining({ canCreateHousehold: false, choice: 'invite' }));
		expect(OnboardingCreateCard).not.toHaveBeenCalled();
	});

	it.each([false, true])('starts a household registration at the welcome step (can create household: %s)', (canCreateHousehold) => {
		if (page.viewer === null) {
			throw new Error('The test requires a signed-in viewer.');
		}

		page.viewer.canCreateHousehold = canCreateHousehold;
		pendingInvitation.markRegistered(TOKEN, 'household', page.viewer.id);
		renderPage();

		expect(OnboardingWelcomeCard).toHaveBeenCalledWith(expect.objectContaining({ canCreateHousehold }));
		expect(OnboardingCreateCard).not.toHaveBeenCalled();
	});

	it('opens creation directly for an app registration with the right to create a household', () => {
		if (page.viewer === null) {
			throw new Error('The test requires a signed-in viewer.');
		}

		page.viewer.canCreateHousehold = true;
		pendingInvitation.markRegistered(TOKEN, 'app', page.viewer.id);
		renderPage();

		expect(OnboardingCreateCard).toHaveBeenCalledWith(expect.objectContaining({
			newAccount: expect.objectContaining({ displayName: 'Анна' }),
			onBack: undefined
		}));
		expect(OnboardingWelcomeCard).not.toHaveBeenCalled();
	});
});
