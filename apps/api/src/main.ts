import { createApiApp } from '@/app';
import { createApiDependencies } from '@/composition-root';

import { serve } from '@hono/node-server';

const port = Number(process.env.API_PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('API_PORT must be a valid TCP port.');
}

const dependencies = createApiDependencies();

dependencies.startReceiptProcessing().catch((error: unknown) => {
	console.error('Failed to start receipt processing.', error);
});

serve({
	fetch: createApiApp(dependencies).fetch,
	port
}, (info) => {
	console.warn(`API listening on http://localhost:${info.port}`);
});
