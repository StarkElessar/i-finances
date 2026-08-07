import './styles/global.scss';

import { render } from 'solid-js/web';

import { CategoryClient } from './features/categories';
import { App } from './app';

const root = document.getElementById('root');

if (root === null) {
	throw new Error('Web application root element was not found.');
}

render(() => <App categoryClient={new CategoryClient()}/>, root);
