import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

const SECRET = 'composition-secret-0123456789abcdef';

type Dependencies = Awaited<ReturnType<typeof loadDependencies>>;

/**
 * Builds the production object graph (`createApiDependencies`) against an in-memory database. Nothing here talks to
 * Telegram: the runner is created but never started.
 */
async function loadDependencies(environment: Record<string, string>, bot?: FakeTelegramBotClient) {
	vi.resetModules();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	vi.stubEnv('DATABASE_URL', ':memory:');
	vi.stubEnv('AUTH_ORIGIN', 'https://finances.example.test');

	for (const [name, value] of Object.entries(environment)) {
		vi.stubEnv(name, value);
	}

	const { createApiApp } = await import('@/app');
	const { createApiDependencies, toApiAppDependencies } = await import('@/composition-root');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const { db } = await import('@/infrastructure/database/client');

	migrate(db, { migrationsFolder: './drizzle' });

	const dependencies = createApiDependencies(db, { telegramBotClient: bot });

	return { app: createApiApp(toApiAppDependencies(dependencies)), dependencies };
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

	it('wires the sign-in handler and the injected bot client: /start <code> reaches the fake bot, never Telegram', async () => {
		const bot = new FakeTelegramBotClient();
		const { app, dependencies } = await loadDependencies({
			TELEGRAM_BOT_TOKEN: '123:token',
			TELEGRAM_BOT_USERNAME: 'i_finances_bot',
			TELEGRAM_UPDATES: 'webhook',
			TELEGRAM_WEBHOOK_SECRET: SECRET
		}, bot);
		const start = await app.request('/api/auth/telegram/start', {
			headers: { origin: 'https://finances.example.test' },
			method: 'POST'
		});
		const { code } = await start.json() as { code: string };
		const update = {
			message: {
				chat: { id: 5, type: 'private' },
				date: 0,
				from: { first_name: 'A', id: 5, is_bot: false },
				message_id: 1,
				text: `/start ${code}`
			},
			update_id: 1
		};

		expect(start.status).toBe(200);
		expect(dependencies.telegram.botClient).toBe(bot);
		expect((await app.request('/api/telegram/webhook', {
			body: JSON.stringify(update),
			headers: { 'x-telegram-bot-api-secret-token': SECRET },
			method: 'POST'
		})).status).toBe(200);
		expect(bot.callsTo('sendMessage')).toEqual([expect.objectContaining({
			input: expect.objectContaining({ chatId: 5, text: expect.stringMatching(/^Вход в i-finances:/u) })
		})]);
	});

	it('mounts the dev confirmation only with DEV_TELEGRAM_LOGIN and refuses it in production', async () => {
		const withoutFlag = await loadDependencies({ TELEGRAM_BOT_USERNAME: 'dev_bot' });
		const withFlag = await loadDependencies({ DEV_TELEGRAM_LOGIN: 'true', TELEGRAM_BOT_USERNAME: 'dev_bot' });

		expect(withoutFlag.dependencies.telegram.devLoginController).toBeUndefined();
		expect(withFlag.dependencies.telegram.devLoginController).toBeDefined();
		await expect(loadDependencies({
			DEV_TELEGRAM_LOGIN: 'true',
			NODE_ENV: 'production',
			TELEGRAM_BOT_USERNAME: 'dev_bot',
			TRUSTED_PROXY_COUNT: '1'
		})).rejects.toThrow(/DEV_TELEGRAM_LOGIN must not be enabled in production/);
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
