import type { RouteSectionProps } from '@solidjs/router';
import { A } from '@solidjs/router';

import { Container } from '~/shared/ui';

export default function AppLayout(props: RouteSectionProps) {
    return (
        <>
            <header class='header'>
                <Container>
                    <nav class='navigation'>
                        <A href='/'>Index</A>
                        <A href='/about'>About</A>
                        <A href='/table-resize'>Таблица и ресайз колонок</A>
                    </nav>
                </Container>
            </header>
            <main class='page'>
                {props.children}
            </main>
        </>
    );
}
