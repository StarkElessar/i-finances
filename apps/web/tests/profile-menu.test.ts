// @vitest-environment jsdom
import { CurrentViewerProvider } from '@/entities/viewer';
import { viewerFromSession } from '@/entities/viewer/model/viewer-access';

import { AuthClient } from '@/features/auth/api';

import { ProfileMenu } from '@/widgets/app-header/ui/profile-menu';

import { createComponent, type JSX } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from './render-ui';

// Keep the menu's content open for DOM assertions; all permission and viewer logic is real.
vi.mock('@/shared/ui/context-menu', () => {
	const content = (props: { children: JSX.Element }) => props.children;

	return { ContextMenu: { Content: content, Item: content, Label: content, Root: content, Separator: () => '|', Trigger: content } };
});
vi.mock('@/features/app-invitation', () => ({ AppInvitationDialog: () => null }));
vi.mock('@/features/household', () => ({ HouseholdDialog: () => null }));
vi.mock('@/features/security', () => ({ SecurityDialog: () => null }));
vi.mock('@/widgets/app-header/ui/profile-settings-dialog', () => ({ ProfileSettingsDialog: () => null }));

function renderMenu(isPlatformAdmin?: boolean, role: 'owner' | 'member' = 'owner'): HTMLElement {
	const viewer = viewerFromSession({
		authenticated: true,
		canCreateHousehold: true,
		hasPassword: true,
		household: { id: 'household-1', name: 'Семья', role },
		isPlatformAdmin,
		telegram: null,
		user: { displayName: 'stark', id: 'user-1', username: 'ordinary-user' }
	});

	return renderUi(() => createComponent(CurrentViewerProvider, {
		initialViewer: viewer,
		get children() {
			return createComponent(ProfileMenu, { authClient: new AuthClient(), onSignedOut: vi.fn() });
		}
	}));
}

describe('profile menu application invitations', () => {
	it.each([false, undefined])('hides invitations for an owner with admin flag %s, regardless of name', (flag) => {
		expect(renderMenu(flag)).not.toHaveTextContent('Приглашения в приложение');
	});

	it.each(['owner', 'member'] as const)('shows invitations to an administrator with household role %s in the specified order', (role) => {
		const host = renderMenu(true, role);
		const labels = ['Профиль', 'Окружение', 'Безопасность', '|', 'Приглашения в приложение', 'Выйти'];
		const positions = labels.map((label) => host.textContent.indexOf(label));

		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((left, right) => left - right));
		expect(host.querySelector('.lucide-link')).toBeInTheDocument();
	});
});
