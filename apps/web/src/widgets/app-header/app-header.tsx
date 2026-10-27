import css from './app-header.module.scss';

import { minWidthQuery } from '@/shared/lib';
import { AppLogo } from '@/shared/ui/app-logo';
import { BottomNavigation, type BottomNavigationProps } from '@/shared/ui/bottom-navigation';
import { Container } from '@/shared/ui/container';

import type { AuthClient } from '@/features/auth';

import { ProfileMenu } from '@/widgets/app-header/ui/profile-menu';

import { A } from '@solidjs/router';
import { ChartColumn, House, Receipt, Tag, Users } from 'lucide-solid';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';

type NavigationMode = 'desktop' | 'mobile';

type NavigationLink = BottomNavigationProps['items'][number];

// Top navigation from `sm` (owner's variant A, development/decisions/kit-open-questions.md, section 4): on 640-959
// the logo shrinks to its mark and the links get 12 px side padding, so everything fits in 585 px.
const DESKTOP_NAVIGATION_QUERY = minWidthQuery('sm');

const NAV_LINKS: BottomNavigationProps['items'] = [
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

function DesktopNavigation() {
	return (
		<nav aria-label='Основная навигация' class={css.desktopNavigation}>
			<For each={NAV_LINKS}>{renderNavigationLink}</For>
		</nav>
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
					<span class={css.logo}><AppLogo/><span class={css.logoWord}>iFinances</span></span>
					<Show when={navigationMode() === 'desktop'}>
						<DesktopNavigation/>
					</Show>
					<ProfileMenu authClient={props.authClient} onSignedOut={props.onSignedOut}/>
				</div>
				<Show when={navigationMode() === 'mobile'}>
					<BottomNavigation items={NAV_LINKS}/>
				</Show>
			</Container>
		</header>
	);
}
