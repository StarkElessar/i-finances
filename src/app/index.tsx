import './app.scss';

import { MetaProvider, Title } from '@solidjs/meta';
import { A, Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';

import { Container } from '~/shared/ui';

export default function App() {
    return (
        <Router
            root={(props) => (
                <MetaProvider>
                    <Title>SolidStart - Basic</Title>

                    <header class='header'>
                        <Container>
                            <nav class='navigation'>
                                <A href='/'>Index</A>
                                <A href='/about'>About</A>
                                <A href='/table-resize'>Таблица и ресайз колонок</A>
                            </nav>
                        </Container>
                    </header>

                    <Suspense>
                        <main class='page'>
                            {props.children}
                        </main>
                    </Suspense>
                </MetaProvider>
            )}
        >
            <FileRoutes/>
        </Router>
    );
}
