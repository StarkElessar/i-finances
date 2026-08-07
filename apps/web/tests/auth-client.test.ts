import { describe, expect, it } from 'vitest';

import { AuthClient } from '../src/features/auth/api';

describe('AuthClient', () => {
	it('loads the current session through the shared API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/auth/session');
			expect(init?.credentials).toBe('same-origin');

			return new Response(JSON.stringify({ authenticated: false }), {
				status: 200
			});
		};
		const client = new AuthClient({ fetcher });

		await expect(client.currentSession()).resolves.toEqual({ authenticated: false });
	});

	it('converts a validation HTTP response into a typed sign-in result', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/auth/sign-in');
			expect(init?.method).toBe('POST');
			const body = typeof init?.body === 'string' ? init.body : '';

			expect(JSON.parse(body)).toEqual({
				password: 'short-password',
				username: 'sergei'
			});

			return new Response(JSON.stringify({
				errorCode: 'invalid-input',
				fieldErrors: { password: 'Пароль должен содержать не менее 12 символов.' },
				message: 'Проверьте поля формы.',
				ok: false
			}), { status: 400 });
		};
		const client = new AuthClient({ fetcher });

		await expect(client.signIn({
			password: 'short-password',
			username: 'sergei'
		})).resolves.toMatchObject({
			errorCode: 'invalid-input',
			ok: false
		});
	});
});
