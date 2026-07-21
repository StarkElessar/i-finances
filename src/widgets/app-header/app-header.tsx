import css from './app-header.module.scss';

import { A } from '@solidjs/router';

import { Container } from '~/shared/ui';
import { ProfileMenu } from '~/widgets/app-header/ui/profile-menu';

/**
 * Renders the authenticated application header.
 */
export function AppHeader() {
    return (
        <header class={css.root}>
            <Container class={css.inner}>
                <nav class={css.navigation}>
                    <A href='/'>Index</A>
                    <A href='/about'>About</A>
                    <A href='/table-resize'>Таблица и ресайз колонок</A>
                </nav>
                <ProfileMenu/>
            </Container>
        </header>
    );
}
