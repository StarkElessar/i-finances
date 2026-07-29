import './app/global.scss';

import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';

import { RootLayout } from '~/app/root-layout';

// Solid Router single-flight can hit Vite module-runner errors after development HMR.
const isSingleFlightEnabled = import.meta.env.PROD;

export default function App() {
    return (
        <Router
            root={RootLayout}
            singleFlight={isSingleFlightEnabled}
        >
            <FileRoutes/>
        </Router>
    );
}
