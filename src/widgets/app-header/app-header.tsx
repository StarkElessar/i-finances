import css from './app-header.module.scss';

import { A } from '@solidjs/router';
import { For } from 'solid-js';

import { Container } from '~/shared/ui';
import { AppLogo } from '~/shared/ui/app-logo';
import { ProfileMenu } from '~/widgets/app-header/ui/profile-menu';

/**
 * Renders the authenticated application header.
 */
export function AppHeader() {
    const navLinks = [
        { href: '/', label: 'Главная' },
        { href: '/about', label: 'Категории' },
        { href: '/stats', label: 'Статистика' },
        { href: '/table-resize', label: 'Таблица и ресайз колонок' }
    ];
    return (
        <header class={css.root}>
            <Container class={css.inner}>
                <span class={css.logo}><AppLogo/> iFinances</span>
                <nav class={css.navigation}>
                    <For each={navLinks}>
                        {(link) => (
                            <A end activeClass={css.activeLink} class={css.navLink} href={link.href}>{link.label}</A>
                        )}
                    </For>
                </nav>
                <ProfileMenu/>
            </Container>
        </header>
    );
}
