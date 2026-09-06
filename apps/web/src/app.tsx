import { AppRouter } from '@/app/router';

import { MetaProvider } from '@solidjs/meta';

import type { AppServices } from './app/app-services';

export type AppProps = AppServices;

export function App(props: AppProps) {
	return (
		<MetaProvider>
			<AppRouter {...props}/>
		</MetaProvider>
	);
}
