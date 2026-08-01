import css from './profile-menu.module.scss';

import type { CurrentViewer } from '~/entities/viewer';
import { useCurrentViewer } from '~/entities/viewer';
import { PasskeyRegistrationMenuItem } from '~/features/passkey-registration';
import { ContextMenu } from '~/shared/ui';

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

/**
 * Renders account actions for the authenticated user.
 */
export function ProfileMenu() {
	const viewer = useCurrentViewer();
	const viewerName = () => getViewerName(viewer());
	const viewerMeta = () => viewer()?.username ? `@${viewer()?.username}` : 'Загрузка профиля';
	const triggerLabel = () => `Открыть меню профиля: ${viewerName()}`;

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
				<form action='/logout' class={css.logoutForm} method='post'>
					<ContextMenu.Item closeOnSelect={false} type='submit' variant='danger'>
						Выйти
					</ContextMenu.Item>
				</form>
			</ContextMenu.Content>
		</ContextMenu.Root>
	);
}
