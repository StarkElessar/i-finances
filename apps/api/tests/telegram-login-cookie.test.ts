import {
	createClearedTelegramLoginCookie,
	createTelegramLoginCookie,
	readTelegramLoginCookie
} from '@/http/telegram-login-cookie';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The cookie of the browser that started a Telegram sign-in (flow 5.1): its secret is the only thing that ties a
 * confirmation in the bot to this browser, so the attributes are part of the protection, in production above all.
 */
describe('Telegram sign-in cookie', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('is Secure in production, both when set and when cleared', () => {
		vi.stubEnv('NODE_ENV', 'production');

		const cookie = createTelegramLoginCookie('secret-value', 600);
		const cleared = createClearedTelegramLoginCookie();

		for (const header of [cookie, cleared]) {
			expect(header.split('; ')).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/api/auth/telegram', 'Secure']));
		}

		expect(cookie).toMatch(/^i_finances_tg_login=secret-value; /u);
		expect(cookie.split('; ')).toContain('Max-Age=600');
		expect(cleared.split('; ')).toContain('Max-Age=0');
	});

	it('is not Secure outside production, so plain-http local development keeps working', () => {
		vi.stubEnv('NODE_ENV', 'development');

		expect(createTelegramLoginCookie('secret-value', 600).split('; ')).not.toContain('Secure');
		expect(createClearedTelegramLoginCookie().split('; ')).not.toContain('Secure');
	});

	it('never lives less than a second and rounds the lifetime up', () => {
		expect(createTelegramLoginCookie('s', 0.2).split('; ')).toContain('Max-Age=1');
		expect(createTelegramLoginCookie('s', 59.5).split('; ')).toContain('Max-Age=60');
	});

	it('reads the secret back from the request', () => {
		const request = new Request('http://localhost/api/auth/telegram/complete', {
			headers: { cookie: 'i_finances_session=abc; i_finances_tg_login=secret-value' }
		});

		expect(readTelegramLoginCookie(request)).toBe('secret-value');
		expect(readTelegramLoginCookie(new Request('http://localhost/api/auth/telegram/complete'))).toBeUndefined();
	});
});
