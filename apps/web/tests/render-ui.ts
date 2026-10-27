import '@testing-library/jest-dom/vitest';

import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { onTestFinished } from 'vitest';

/** Mount real Solid DOM, including portals, and release effects after each test. */
export function renderUi(view: () => JSX.Element) {
	const host = document.createElement('div');

	document.body.append(host);

	const dispose = render(view, host);

	onTestFinished(() => {
		dispose();
		host.remove();
	});

	return host;
}
