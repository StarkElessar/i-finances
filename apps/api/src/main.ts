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

const app = createApiApp({
	...dependencies,
	telegramWebhookController: dependencies.telegram.webhookController
});

const server = serve(
	{
		fetch: app.fetch,
		port
	},
	(info) => {
		console.warn(`API listening on http://localhost:${info.port}`);
	}
);

// Telegram: webhook registration or polling starts only once the server is up, and polling ends with the process.
const telegramUpdatesRunner = dependencies.telegram.updatesRunner;

telegramUpdatesRunner?.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		const finish = (): void => {
			process.exit(0);
		};

		server.close();
		(telegramUpdatesRunner?.stop() ?? Promise.resolve()).then(finish, finish);
	});
}
