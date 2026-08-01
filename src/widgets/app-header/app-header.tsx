import css from './app-header.module.scss';

import { A } from '@solidjs/router';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

import { AppLogo } from '~/shared/ui/app-logo';
import { Container } from '~/shared/ui/container';
import { ProfileMenu } from '~/widgets/app-header/ui/profile-menu';

type NavigationMode = 'desktop' | 'mobile';

type NavigationLink = {
	href: string;
	label: string;
};

const DESKTOP_NAVIGATION_QUERY = '(min-width: 60em)';

const NAV_LINKS: NavigationLink[] = [
	{ href: '/', label: 'Главная' },
	{ href: '/receipts', label: 'Чеки' },
	{ href: '/categories', label: 'Категории' },
	{ href: '/contacts', label: 'Контакты' },
	{ href: '/stats', label: 'Статистика' }
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

function MobileNavigation() {
	return (
		<Portal>
			<div class={css.mobileNavigationShell}>
				<nav aria-label='Основная навигация' class={css.mobileNavigation}>
					<For each={NAV_LINKS}>{renderNavigationLink}</For>
				</nav>
			</div>
		</Portal>
	);
}

/**
 * Renders the authenticated application header.
 */
export function AppHeader() {
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
					<ProfileMenu/>
				</div>
				<Show when={navigationMode() === 'mobile'}>
					<MobileNavigation/>
				</Show>
			</Container>
		</header>
	);
}
