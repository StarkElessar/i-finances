import css from './profile-menu.module.scss';

import { getInitials } from '@/shared/lib';
import { ContextMenu } from '@/shared/ui';

import type { CurrentViewer } from '@/entities/viewer';
import { useCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import { HouseholdDialog } from '@/features/household';
import { PasskeyRegistrationMenuItem } from '@/features/passkey-registration';

import { createSignal, Show } from 'solid-js';

import { ProfileSettingsDialog } from './profile-settings-dialog';

/**
 * Returns the best available user-facing viewer name.
 */
function getViewerName(viewer: CurrentViewer | null | undefined): string {
	return viewer?.displayName || viewer?.username || 'Пользователь';
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
	const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
	const [isHouseholdOpen, setIsHouseholdOpen] = createSignal(false);

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
		<>
			<ContextMenu.Root class={css.root} triggerMode='click'>
				<ContextMenu.Trigger aria-label={triggerLabel()} class={css.trigger}>
					{getInitials(getViewerName(viewer()))}
				</ContextMenu.Trigger>
				<ContextMenu.Content align='end' class={css.content}>
					<ContextMenu.Label class={css.viewer}>
						<span class={css.viewerName}>{viewerName()}</span>
						<span class={css.viewerMeta}>{viewerMeta()}</span>
					</ContextMenu.Label>
					<PasskeyRegistrationMenuItem/>
					<ContextMenu.Item
						onSelect={() => {
							// Deferred by one tick so this runs after ContextMenu's own
							// close()/focusTrigger() setTimeout(...,0) restores focus to
							// the trigger button — otherwise the two timers race and the
							// dialog's focus-into-content can lose to the menu's restore.
							setTimeout(() => setIsSettingsOpen(true), 0);
						}}
					>
						Профиль
					</ContextMenu.Item>
					<ContextMenu.Item
						onSelect={() => {
							// Deferred like the profile dialog above, for the same focus race.
							setTimeout(() => setIsHouseholdOpen(true), 0);
						}}
					>
						Окружение
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
			<HouseholdDialog open={isHouseholdOpen()} onOpenChange={setIsHouseholdOpen}/>
			<ProfileSettingsDialog
				authClient={props.authClient}
				open={isSettingsOpen()}
				onOpenChange={setIsSettingsOpen}
			/>
		</>
	);
}
