import { createApiApp } from '@/app';
import { createApiDependencies } from '@/composition-root';

import { serve } from '@hono/node-server';

const port = Number(process.env.API_PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('API_PORT must be a valid TCP port.');
}

serve({
	fetch: createApiApp(createApiDependencies()).fetch,
	port
}, (info) => {
	console.warn(`API listening on http://localhost:${info.port}`);
});
