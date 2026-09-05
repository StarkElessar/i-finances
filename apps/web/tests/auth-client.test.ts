import { describe, expect, it, vi } from 'vitest';

const passkeyMocks = vi.hoisted(() => ({
	browserSupportsWebAuthn: vi.fn(() => true),
	startAuthentication: vi.fn(),
	startRegistration: vi.fn()
}));

vi.mock('@simplewebauthn/browser', () => passkeyMocks);

import { AuthClient } from '@/features/auth/api';

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

	it('performs the passkey sign-in ceremony through the API', async () => {
		passkeyMocks.startAuthentication.mockResolvedValue({
			clientExtensionResults: {},
			id: 'credential-1',
			rawId: 'credential-1',
			response: {
				authenticatorData: 'authenticator-data',
				clientDataJSON: 'client-data',
				signature: 'signature'
			},
			type: 'public-key'
		});
		let requestCount = 0;
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			requestCount += 1;

			if (requestCount === 1) {
				expect(input).toBe('/api/auth/passkey/sign-in/options');

				return new Response(JSON.stringify({
					challenge: 'challenge-1',
					rpId: 'localhost',
					userVerification: 'preferred'
				}), { status: 200 });
			}

			expect(input).toBe('/api/auth/passkey/sign-in/verification');
			const body = typeof init?.body === 'string' ? init.body : '';

			expect(JSON.parse(body)).toMatchObject({
				returnTo: '/categories',
				response: { id: 'credential-1' }
			});

			return new Response(JSON.stringify({
				ok: true,
				redirectTo: '/categories'
			}), { status: 200 });
		};
		const client = new AuthClient({ fetcher });

		await expect(client.signInWithPasskey('/categories')).resolves.toEqual({
			ok: true,
			redirectTo: '/categories'
		});
		expect(passkeyMocks.startAuthentication).toHaveBeenCalledWith({
			optionsJSON: expect.objectContaining({ challenge: 'challenge-1' })
		});
	});

	it('registers a passkey for the current session through the API', async () => {
		passkeyMocks.startRegistration.mockResolvedValue({
			clientExtensionResults: {},
			id: 'credential-1',
			rawId: 'credential-1',
			response: {
				attestationObject: 'attestation-object',
				clientDataJSON: 'client-data'
			},
			type: 'public-key'
		});
		let requestCount = 0;
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			requestCount += 1;

			if (requestCount === 1) {
				expect(input).toBe('/api/auth/passkey/registration/options');

				return new Response(JSON.stringify({
					challenge: 'challenge-1',
					pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
					rp: { name: 'iFinances' },
					user: { displayName: 'Sergei Test', id: 'user-1', name: 'sergei' }
				}), { status: 200 });
			}

			expect(input).toBe('/api/auth/passkey/registration/verification');
			const body = typeof init?.body === 'string' ? init.body : '';

			expect(JSON.parse(body)).toMatchObject({
				deviceName: 'MacBook',
				response: { id: 'credential-1' }
			});

			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		};
		const client = new AuthClient({ fetcher });

		await expect(client.registerPasskey('MacBook')).resolves.toEqual({ ok: true });
		expect(passkeyMocks.startRegistration).toHaveBeenCalledWith({
			optionsJSON: expect.objectContaining({ challenge: 'challenge-1' })
		});
	});
});
