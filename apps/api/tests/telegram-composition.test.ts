import { afterEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'composition-secret-0123456789abcdef';

type Dependencies = Awaited<ReturnType<typeof loadDependencies>>;

/**
 * Builds the production object graph (`createApiDependencies`) against an in-memory database. Nothing here talks to
 * Telegram: the runner is created but never started.
 */
async function loadDependencies(environment: Record<string, string>) {
	vi.resetModules();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	vi.stubEnv('DATABASE_URL', ':memory:');
	vi.stubEnv('AUTH_ORIGIN', 'https://finances.example.test');

	for (const [name, value] of Object.entries(environment)) {
		vi.stubEnv(name, value);
	}

	const { createApiApp } = await import('@/app');
	const { createApiDependencies } = await import('@/composition-root');
	const dependencies = createApiDependencies();

	return { app: createApiApp({ telegramWebhookController: dependencies.telegram.webhookController }), dependencies };
}

describe('Telegram wiring in the composition root', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('does nothing by default: no webhook route, no runner, no client', async () => {
		const { app, dependencies } = await loadDependencies({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_UPDATES: '' });
		const response = await app.request('/api/telegram/webhook', { body: '{}', method: 'POST' });

		expect(dependencies.telegram).toMatchObject({ botClient: undefined, updatesRunner: undefined, webhookController: undefined });
		expect(response.status).toBe(404);
	});

	it('webhook mode mounts the route behind the secret and builds the runner', async () => {
		const { app, dependencies }: Dependencies = await loadDependencies({
			TELEGRAM_BOT_TOKEN: '123:token',
			TELEGRAM_BOT_USERNAME: 'i_finances_bot',
			TELEGRAM_UPDATES: 'webhook',
			TELEGRAM_WEBHOOK_SECRET: SECRET
		});
		const update = JSON.stringify({ update_id: 1 });

		expect(dependencies.telegram.updatesRunner).toBeDefined();
		expect(dependencies.telegram.config.webhookUrl).toBe('https://finances.example.test/api/telegram/webhook');
		expect((await app.request('/api/telegram/webhook', { body: update, method: 'POST' })).status).toBe(401);
		expect((await app.request('/api/telegram/webhook', {
			body: update,
			headers: { 'x-telegram-bot-api-secret-token': SECRET },
			method: 'POST'
		})).status).toBe(200);
	});

	it('polling mode builds the runner but exposes no webhook route', async () => {
		const { dependencies } = await loadDependencies({
			TELEGRAM_BOT_TOKEN: '123:token',
			TELEGRAM_BOT_USERNAME: 'dev_bot',
			TELEGRAM_UPDATES: 'polling'
		});

		expect(dependencies.telegram.updatesRunner).toBeDefined();
		expect(dependencies.telegram.webhookController).toBeUndefined();
	});

	it('refuses to start in production with a mode but without a token', async () => {
		await expect(loadDependencies({ NODE_ENV: 'production', TELEGRAM_UPDATES: 'webhook', TRUSTED_PROXY_COUNT: '1' }))
			.rejects.toThrow(/TELEGRAM_BOT_TOKEN is required/);
	});
});
