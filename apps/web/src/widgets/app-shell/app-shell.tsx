import css from './app-shell.module.scss';

import { AppLogo, Container } from '@/shared/ui';

import type { AuthClient } from '@/features/auth';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { A } from '@solidjs/router';
import type { JSX } from 'solid-js';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';

type AppShellProps = {
	children: JSX.Element;
	onSignedOut: () => void;
	session: Extract<CurrentSessionResponse, { authenticated: true }>;
	services: { authClient: AuthClient };
};

type NavigationLink = {
	href: string;
	label: string;
};

const NAVIGATION_LINKS: NavigationLink[] = [
	{ href: '/', label: 'Главная' },
	{ href: '/receipts', label: 'Чеки' },
	{ href: '/categories', label: 'Категории' },
	{ href: '/contacts', label: 'Контакты' }
];

function getInitials(displayName: string): string {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return 'IF';
	}

	return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function renderNavigationLink(link: NavigationLink) {
	return (
		<A activeClass={css.activeLink} class={css.navLink} end={link.href === '/'} href={link.href}>
			{link.label}
		</A>
	);
}

export function AppShell(props: AppShellProps) {
	const [isMenuOpen, setIsMenuOpen] = createSignal(false);
	const [error, setError] = createSignal<string>();
	const [isSigningOut, setIsSigningOut] = createSignal(false);

	const handleDocumentClick = (event: MouseEvent) => {
		const target = event.target;

		if (!(target instanceof Element) || target.closest(`.${css.profile}`) === null) {
			setIsMenuOpen(false);
		}
	};

	onMount(() => {
		document.addEventListener('click', handleDocumentClick);
		onCleanup(() => document.removeEventListener('click', handleDocumentClick));
	});

	const handleSignOut = async () => {
		setError(undefined);
		setIsSigningOut(true);

		try {
			await props.services.authClient.signOut();
			props.onSignedOut();
		}
		catch {
			setError('Не удалось завершить сессию.');
		}
		finally {
			setIsSigningOut(false);
		}
	};

	return (
		<div class={css.root}>
			<header class={css.header}>
				<Container useMaxSize>
					<div class={css.topBar}>
						<A class={css.logo} href='/'>
							<AppLogo/>
							<span>iFinances</span>
						</A>
						<nav aria-label='Основная навигация' class={css.desktopNavigation}>
							<For each={NAVIGATION_LINKS}>{renderNavigationLink}</For>
						</nav>
						<div class={css.profile}>
							<button
								aria-expanded={isMenuOpen()}
								aria-haspopup='menu'
								aria-label={`Открыть меню профиля: ${props.session.user.displayName}`}
								class={css.profileTrigger}
								onClick={() => setIsMenuOpen((open) => !open)}
								type='button'
							>
								{getInitials(props.session.user.displayName)}
							</button>
							<Show when={isMenuOpen()}>
								<div class={css.profileMenu} role='menu'>
									<div class={css.profileIdentity}>
										<strong>{props.session.user.displayName}</strong>
										<span>@{props.session.user.username}</span>
									</div>
									<Show when={error()}>
										{(message) => <p class={css.error} role='alert'>{message()}</p>}
									</Show>
									<button
										class={css.signOut}
										disabled={isSigningOut()}
										onClick={handleSignOut}
										role='menuitem'
										type='button'
									>
										{isSigningOut() ? 'Выходим…' : 'Выйти'}
									</button>
								</div>
							</Show>
						</div>
					</div>
				</Container>
			</header>
			<main class={css.main}>{props.children}</main>
			<nav aria-label='Основная навигация' class={css.mobileNavigation}>
				<For each={NAVIGATION_LINKS}>{renderNavigationLink}</For>
			</nav>
		</div>
	);
}
