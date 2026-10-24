import { createApiApp } from '@/app';
import { PasswordService } from '@/modules/auth';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe('password admission in the production composition', () => {
	it('bounds dummy verifications and keeps passkey and Telegram available while password admission is full', async () => {
		vi.stubEnv('DATABASE_URL', ':memory:');
		vi.stubEnv('AUTH_ORIGIN', 'http://localhost:5173');
		vi.stubEnv('TELEGRAM_UPDATES', 'off');
		vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
		vi.stubEnv('TELEGRAM_BOT_USERNAME', 'i_finances_test_bot');
		vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');
		vi.stubEnv('PASSWORD_VERIFY_MAX_CONCURRENT', '8');
		vi.stubEnv('PASSWORD_VERIFY_MAX_QUEUE', '64');
		vi.stubEnv('PASSWORD_VERIFY_QUEUE_TIMEOUT_MS', '2000');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

		// Import the composition only after selecting a disposable database.
		const { db, sqlite } = await import('@/infrastructure/database/client');
		const { createApiDependencies, toApiAppDependencies } = await import('@/composition-root');

		migrate(db, { migrationsFolder: './drizzle' });

		let finish!: () => void;
		const barrier = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const verify = vi.spyOn(PasswordService.prototype, 'verify').mockImplementation(async () => {
			await barrier;

			return false;
		});
		const app = createApiApp(toApiAppDependencies(createApiDependencies(db, { telegramBotClient: new FakeTelegramBotClient() })));
		const headers = { 'content-type': 'application/json', origin: 'http://localhost:5173' };
		const requests = Array.from({ length: 73 }, (_, index) => Promise.resolve(app.request('/api/auth/sign-in', {
			body: JSON.stringify({ password: 'wrong-password', username: `unknown-${index}` }),
			headers,
			method: 'POST'
		})));

		try {
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(verify).toHaveBeenCalledTimes(8);

			const refused = await requests[72];

			expect(refused.status).toBe(429);
			expect(refused.headers.get('retry-after')).toBe('2');

			const passkey = await app.request('/api/auth/passkey/sign-in/options', { headers, method: 'POST' });
			const telegram = await app.request('/api/auth/telegram/start', { body: '{}', headers, method: 'POST' });

			expect(passkey.status).toBe(200);
			expect(await passkey.json()).toHaveProperty('challenge');
			expect(telegram.status).toBe(200);
			expect(await telegram.json()).toHaveProperty('code');
			expect(verify).toHaveBeenCalledTimes(8);
		}
		finally {
			finish();
			await Promise.all(requests);
			sqlite.close();
			delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
		}
	});
});
