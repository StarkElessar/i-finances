import type { CategoryClient } from './features/categories';
import { CategoriesView } from './features/categories';

export type AppProps = {
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
			<CategoriesView client={props.categoryClient}/>
		</main>
	);
}
