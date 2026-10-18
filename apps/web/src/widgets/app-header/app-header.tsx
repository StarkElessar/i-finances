import css from './app-header.module.scss';

import { cn, minWidthQuery, useTextInputFocus } from '@/shared/lib';
import { AppLogo } from '@/shared/ui/app-logo';
import { Container } from '@/shared/ui/container';

import type { AuthClient } from '@/features/auth';

import { ProfileMenu } from '@/widgets/app-header/ui/profile-menu';

import { A } from '@solidjs/router';
import type { LucideIcon } from 'lucide-solid';
import { ChartColumn, House, Receipt, Tag, Users } from 'lucide-solid';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

type NavigationMode = 'desktop' | 'mobile';

type NavigationLink = {
	href: string;
	icon: LucideIcon;
	label: string;
};

// Top navigation from `md`. Layout-Spec asks for it from `sm`, but logo, five links and the avatar need
// about 735 px, so on 640-959 the bottom bar stays (see development/decisions/ui-breakpoints.md).
const DESKTOP_NAVIGATION_QUERY = minWidthQuery('md');

const NAV_LINKS: NavigationLink[] = [
	{ href: '/', icon: House, label: 'Главная' },
	{ href: '/receipts', icon: Receipt, label: 'Чеки' },
	{ href: '/categories', icon: Tag, label: 'Категории' },
	{ href: '/contacts', icon: Users, label: 'Контакты' },
	{ href: '/stats', icon: ChartColumn, label: 'Статистика' }
];

function renderNavigationLink(link: NavigationLink) {
	return (
		<A
			end
			activeClass={css.activeLink}
			class={css.navLink}
			href={link.href}
		>
			{link.label}
		</A>
	);
}

function renderMobileNavigationLink(link: NavigationLink) {
	return (
		<A
			end
			activeClass={css.mobileLinkActive}
			class={css.mobileLink}
			href={link.href}
		>
			<link.icon aria-hidden='true' size={20}/>
			<span>{link.label}</span>
		</A>
	);
}

function DesktopNavigation() {
	return (
		<nav aria-label='Основная навигация' class={css.desktopNavigation}>
			<For each={NAV_LINKS}>{renderNavigationLink}</For>
		</nav>
	);
}

function MobileNavigation() {
	const isKeyboardOpen = useTextInputFocus();

	return (
		<Portal>
			<nav
				aria-label='Основная навигация'
				class={cn(css.mobileNavigation, isKeyboardOpen() && css.mobileNavigationHidden)}
			>
				<For each={NAV_LINKS}>{renderMobileNavigationLink}</For>
			</nav>
		</Portal>
	);
}

export type AppHeaderProps = {
	authClient: AuthClient;
	onSignedOut: () => void;
};

/**
 * Renders the authenticated application header.
 */
export function AppHeader(props: AppHeaderProps) {
	const [navigationMode, setNavigationMode] = createSignal<NavigationMode>();

	onMount(() => {
		const mediaQuery = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
		const syncNavigationMode = (): void => {
			setNavigationMode(mediaQuery.matches ? 'desktop' : 'mobile');
		};

		syncNavigationMode();
		mediaQuery.addEventListener('change', syncNavigationMode);
		onCleanup(() => mediaQuery.removeEventListener('change', syncNavigationMode));
	});

	return (
		<header class={css.root}>
			<Container class={css.inner}>
				<div class={css.topBar}>
					<span class={css.logo}><AppLogo/> iFinances</span>
					<Show when={navigationMode() === 'desktop'}>
						<DesktopNavigation/>
					</Show>
					<ProfileMenu authClient={props.authClient} onSignedOut={props.onSignedOut}/>
				</div>
				<Show when={navigationMode() === 'mobile'}>
					<MobileNavigation/>
				</Show>
			</Container>
		</header>
	);
}
