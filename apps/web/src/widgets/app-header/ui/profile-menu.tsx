import css from './profile-menu.module.scss';

import { ContextMenu } from '@/shared/ui';

import type { CurrentViewer } from '@/entities/viewer';
import { useCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import { PasskeyRegistrationMenuItem } from '@/features/passkey-registration';

import { createSignal, Show } from 'solid-js';

/**
 * Returns the best available user-facing viewer name.
 */
function getViewerName(viewer: CurrentViewer | null | undefined): string {
	return viewer?.displayName || viewer?.username || 'Пользователь';
}

/**
 * Creates compact initials for the round profile trigger.
 */
function createViewerInitials(viewer: CurrentViewer | null | undefined): string {
	const name = getViewerName(viewer).trim();
	const parts = name.split(/\s+/).filter(Boolean);

	if (!parts.length) {
		return 'ID';
	}

	if (parts.length === 1) {
		return Array.from(parts[0] ?? 'ID').slice(0, 2).join('').toUpperCase();
	}

	return parts
		.slice(0, 2)
		.map((part) => Array.from(part)[0])
		.join('')
		.toUpperCase();
}

export type ProfileMenuProps = {
	authClient: AuthClient;
	onSignedOut: () => void;
};

/**
 * Renders account actions for the authenticated user.
 *
 * The original app signs out via a form POST to a server route that
 * redirects the browser; the SPA has no such route, so this calls the JSON
 * sign-out endpoint directly and lets the caller refetch session state.
 */
export function ProfileMenu(props: ProfileMenuProps) {
	const viewer = useCurrentViewer();
	const viewerName = () => getViewerName(viewer());
	const viewerMeta = () => viewer()?.username ? `@${viewer()?.username}` : 'Загрузка профиля';
	const triggerLabel = () => `Открыть меню профиля: ${viewerName()}`;
	const [isSigningOut, setIsSigningOut] = createSignal(false);
	const [signOutError, setSignOutError] = createSignal<string>();

	const handleSignOut = async (): Promise<void> => {
		setSignOutError(undefined);
		setIsSigningOut(true);

		try {
			await props.authClient.signOut();
			props.onSignedOut();
		}
		catch {
			setSignOutError('Не удалось завершить сессию.');
		}
		finally {
			setIsSigningOut(false);
		}
	};

	return (
		<ContextMenu.Root class={css.root} mobileBreakpoint={640} triggerMode='click'>
			<ContextMenu.Trigger aria-label={triggerLabel()} class={css.trigger}>
				{createViewerInitials(viewer())}
			</ContextMenu.Trigger>
			<ContextMenu.Content align='end' class={css.content}>
				<ContextMenu.Label class={css.viewer}>
					<span class={css.viewerName}>{viewerName()}</span>
					<span class={css.viewerMeta}>{viewerMeta()}</span>
				</ContextMenu.Label>
				<PasskeyRegistrationMenuItem/>
				<ContextMenu.Item disabled title='Раздел профиля будет добавлен позже'>
					Профиль
				</ContextMenu.Item>
				<ContextMenu.Item disabled title='Раздел безопасности будет добавлен позже'>
					Безопасность
				</ContextMenu.Item>
				<ContextMenu.Separator/>
				<Show when={signOutError()}>
					{(message) => <p class={css.error} role='alert'>{message()}</p>}
				</Show>
				<ContextMenu.Item
					closeOnSelect={false}
					disabled={isSigningOut()}
					onSelect={handleSignOut}
					variant='danger'
				>
					{isSigningOut() ? 'Выходим…' : 'Выйти'}
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	);
}
