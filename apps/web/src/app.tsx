import { AppRouter } from '@/app/router';

import type { AuthClient } from '@/features/auth';

import { MetaProvider } from '@solidjs/meta';

export type AppProps = {
	authClient: AuthClient;
};

export function App(props: AppProps) {
	return (
		<MetaProvider>
			<AppRouter authClient={props.authClient}/>
		</MetaProvider>
	);
}
