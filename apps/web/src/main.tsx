import './styles/global.scss';

import { render } from 'solid-js/web';

import { AccountClient } from './features/accounts';
import { AuthClient } from './features/auth';
import { CategoryClient } from './features/categories';
import { App } from './app';

const root = document.getElementById('root');

if (root === null) {
	throw new Error('Web application root element was not found.');
}

render(() => (
	<App
		accountClient={new AccountClient()}
		authClient={new AuthClient()}
		categoryClient={new CategoryClient()}
	/>
), root);
