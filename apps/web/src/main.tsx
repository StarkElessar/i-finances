import './styles/global.scss';

import { AuthClient } from '@/features/auth';
import { installInvitationAddressClaim, pendingInvitation } from '@/features/invitation';

import { App } from '@/app';

import { render } from 'solid-js/web';

const root = document.querySelector('#root');

if (root === null) {
	throw new Error('Web application root element was not found.');
}

// Before anything waits for the session: an invitation token must leave the address bar at once (review of U4).
installInvitationAddressClaim(window, pendingInvitation);

render(() => <App authClient={new AuthClient()}/>, root);
