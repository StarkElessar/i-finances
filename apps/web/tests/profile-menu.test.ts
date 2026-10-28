import { CurrentViewerProvider } from '@/entities/viewer';
import { viewerFromSession } from '@/entities/viewer/model/viewer-access';

import { AuthClient } from '@/features/auth/api';

import { ProfileMenu } from '@/widgets/app-header/ui/profile-menu';

import { createComponent, type JSX } from 'solid-js';
import { renderToString } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';

// Open the menu's content for a Node HTML assertion; all permission and viewer logic is real.
vi.mock('@/shared/ui/context-menu', () => {
	const content = (props: { children: JSX.Element }) => props.children;

	return { ContextMenu: { Content: content, Item: content, Label: content, Root: content, Separator: () => '|', Trigger: content } };
});
vi.mock('@/features/app-invitation', () => ({ AppInvitationDialog: () => null }));
vi.mock('@/features/household', () => ({ HouseholdDialog: () => null }));
vi.mock('@/features/security', () => ({ SecurityDialog: () => null }));
vi.mock('@/widgets/app-header/ui/profile-settings-dialog', () => ({ ProfileSettingsDialog: () => null }));

function renderMenu(isPlatformAdmin?: boolean, role: 'owner' | 'member' = 'owner'): string {
	const viewer = viewerFromSession({
		authenticated: true,
		canCreateHousehold: true,
		hasPassword: true,
		household: { id: 'household-1', name: 'Семья', role },
		isPlatformAdmin,
		telegram: null,
		user: { displayName: 'stark', id: 'user-1', username: 'ordinary-user' }
	});

	return renderToString(() => createComponent(CurrentViewerProvider, {
		initialViewer: viewer,
		get children() {
			return createComponent(ProfileMenu, { authClient: new AuthClient(), onSignedOut: vi.fn() });
		}
	}));
}

describe('profile menu application invitations', () => {
	it.each([false, undefined])('hides invitations for an owner with admin flag %s, regardless of name', (flag) => {
		expect(renderMenu(flag)).not.toContain('Приглашения в приложение');
	});

	it.each(['owner', 'member'] as const)('shows invitations to an administrator with household role %s in the specified order', (role) => {
		const html = renderMenu(true, role);
		const labels = ['Профиль', 'Окружение', 'Безопасность', '|', 'Приглашения в приложение', 'Выйти'];
		const positions = labels.map((label) => html.indexOf(label));

		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((left, right) => left - right));
		expect(html).toContain('lucide-link');
	});
});
