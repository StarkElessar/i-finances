import type { AuthClient } from './features/auth';
import { AuthView } from './features/auth';
import type { CategoryClient } from './features/categories';

export type AppProps = {
	authClient: AuthClient;
	categoryClient: CategoryClient;
};

export function App(props: AppProps) {
	return (
		<main class='app-shell'>
			<header class='app-header'>
				<p class='eyebrow'>i-finances</p>
				<h1>Финансы семьи</h1>
				<p class='app-description'>Клиентский Solid.js слой общается с API только через HTTP.</p>
			</header>
			<AuthView
				authClient={props.authClient}
				categoryClient={props.categoryClient}
			/>
		</main>
	);
}
