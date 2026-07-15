// @refresh reload
import { mount, StartClient } from '@solidjs/start/client';

const root = document.querySelector('#app');

if (root) {
    mount(() => <StartClient/>, root);
}
