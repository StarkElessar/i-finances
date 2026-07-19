import './app/global.scss';

import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';

import { RootLayout } from '~/app/root-layout';

export default function App() {
    return (
        <Router root={RootLayout}>
            <FileRoutes/>
        </Router>
    );
}
