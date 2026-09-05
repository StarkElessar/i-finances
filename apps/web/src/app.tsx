import { AppRouter } from '@/app/router';

import type { AppServices } from './app/app-services';

export type AppProps = AppServices;

export function App(props: AppProps) {
	return <AppRouter {...props}/>;
}
