import type { RouteSectionProps } from '@solidjs/router';
import { A } from '@solidjs/router';

import { Button, Container } from '~/shared/ui';

export default function AppLayout(props: RouteSectionProps) {
    return (
        <>
            <header class='header'>
                <Container class='header-inner'>
                    <nav class='navigation'>
                        <A href='/'>Index</A>
                        <A href='/about'>About</A>
                        <A href='/table-resize'>Таблица и ресайз колонок</A>
                    </nav>
                    <form action='/logout' class='logout-form' method='post'>
                        <Button size='sm' type='submit' variant='secondary'>
                            Выйти
                        </Button>
                    </form>
                </Container>
            </header>
            <main class='page'>
                {props.children}
            </main>
        </>
    );
}
