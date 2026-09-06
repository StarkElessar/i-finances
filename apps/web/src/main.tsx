import './styles/global.scss';

import { AuthClient } from '@/features/auth';

import { App } from '@/app';

import { render } from 'solid-js/web';

const root = document.querySelector('#root');

if (root === null) {
	throw new Error('Web application root element was not found.');
}

render(() => <App authClient={new AuthClient()}/>, root);
