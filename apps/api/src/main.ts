import { createApiApp } from '@/app';
import { createApiDependencies, toApiAppDependencies } from '@/composition-root';

import { serve } from '@hono/node-server';

const port = Number(process.env.API_PORT ?? 3001);
/**
 * How long shutdown waits for bot update handlers that are still running. Docker sends SIGKILL 10 s after SIGTERM, so
 * the whole shutdown is capped below that.
 */
const UPDATE_HANDLERS_DRAIN_MILLISECONDS = 7_000;
const SHUTDOWN_DEADLINE_MILLISECONDS = 9_000;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('API_PORT must be a valid TCP port.');
}

const dependencies = createApiDependencies();

dependencies.startReceiptProcessing().catch((error: unknown) => {
	console.error('Failed to start receipt processing.', error);
});

const app = createApiApp(toApiAppDependencies(dependencies));

// Telegram: webhook registration or polling starts only once the server is up, and polling ends with the process.
const telegramUpdatesRunner = dependencies.telegram.updatesRunner;
const telegramDispatcher = dependencies.telegram.dispatcher;

const server = serve(
	{
		fetch: app.fetch,
		port
	},
	(info) => {
		console.warn(`API listening on http://localhost:${info.port}`);
		telegramUpdatesRunner?.start();
	}
);

async function shutDown(): Promise<void> {
	// No new requests (webhook deliveries included), no new polled updates; then let running handlers finish, so that a
	// confirmation is not cut off between «request confirmed» and «bot message edited».
	server.close();
	await telegramUpdatesRunner?.stop();

	if (!await telegramDispatcher.drain(UPDATE_HANDLERS_DRAIN_MILLISECONDS)) {
		console.error('Telegram update handlers were still running at shutdown.');
	}
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		const finish = (): void => {
			process.exit(0);
		};

		setTimeout(finish, SHUTDOWN_DEADLINE_MILLISECONDS).unref();
		shutDown().then(finish, finish);
	});
}
