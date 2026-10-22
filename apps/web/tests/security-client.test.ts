import { resetSessionRotationGate, subscribeToApiAccessFailures } from '@/shared/api';

import { SecurityClient } from '@/features/security/api';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
	return vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { headers, status }));
}

const FAILURE = (errorCode: string, message = 'x', fieldErrors?: Record<string, string>) => ({
	errorCode,
	fieldErrors,
	message,
	ok: false
});

describe('SecurityClient', () => {
	const unsubscribers: (() => void)[] = [];

	beforeEach(() => {
		resetSessionRotationGate();
	});

	afterEach(() => {
		for (const unsubscribe of unsubscribers.splice(0)) {
			unsubscribe();
		}
	});

	it('lists passkeys and sessions of the caller', async () => {
		const passkeys = respond(200, {
			ok: true,
			passkeys: [{ createdAt: '2026-09-12T10:00:00.000Z', deviceName: 'iPhone 15', id: 'p1', lastUsedAt: null }]
		});

		await expect(new SecurityClient({ fetcher: passkeys }).listPasskeys())
			.resolves.toMatchObject({ ok: true, passkeys: [{ id: 'p1' }] });
		expect(passkeys).toHaveBeenCalledWith('/api/security/passkeys', expect.objectContaining({ method: 'GET' }));
	});

	it('deletes a passkey by an encoded id and returns a refusal as a value', async () => {
		const fetcher = respond(409, FAILURE('last-passkey'));
		const result = await new SecurityClient({ fetcher }).deletePasskey('a/b c');

		expect(fetcher).toHaveBeenCalledWith('/api/security/passkeys/a%2Fb%20c', expect.objectContaining({ method: 'DELETE' }));
		expect(result).toMatchObject({ errorCode: 'last-passkey', ok: false });
	});

	it('ends other sessions with the reserved path and one session by its id', async () => {
		const others = respond(200, { ok: true, revokedSessionCount: 2 });
		const one = respond(409, FAILURE('current-session'));

		await expect(new SecurityClient({ fetcher: others }).revokeOtherSessions()).resolves.toEqual({ ok: true, revokedSessionCount: 2 });
		expect(others).toHaveBeenCalledWith('/api/security/sessions/others', expect.objectContaining({ method: 'DELETE' }));
		await expect(new SecurityClient({ fetcher: one }).revokeSession('s1'))
			.resolves.toMatchObject({ errorCode: 'current-session', ok: false });
		expect(one).toHaveBeenCalledWith('/api/security/sessions/s1', expect.objectContaining({ method: 'DELETE' }));
	});

	describe('changePassword', () => {
		const input = { currentPassword: 'old password 1', newPassword: 'new password 12' };

		it('sends the two passwords and returns the count of ended sessions', async () => {
			const fetcher = respond(200, { ok: true, revokedSessionCount: 2 });
			const response = await new SecurityClient({ fetcher }).changePassword(input);

			expect(response.result).toEqual({ ok: true, revokedSessionCount: 2 });
			const body = fetcher.mock.calls[0]?.[1]?.body;

			expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual(input);
		});

		it('returns a wrong current password as a value with its field error and does not report a lost session', async () => {
			const listener = vi.fn();

			unsubscribers.push(subscribeToApiAccessFailures(listener));

			const message = 'Текущий пароль указан неверно.';
			const fetcher = respond(400, FAILURE('invalid-current-password', message, { currentPassword: message }));
			const response = await new SecurityClient({ fetcher }).changePassword(input);

			expect(response.result).toMatchObject({
				errorCode: 'invalid-current-password',
				fieldErrors: { currentPassword: expect.any(String) },
				ok: false
			});
			expect(listener).not.toHaveBeenCalled();
		});

		it('carries the Retry-After of a 429 and never retries', async () => {
			const fetcher = respond(429, FAILURE('rate-limited'), { 'retry-after': '240' });
			const response = await new SecurityClient({ fetcher }).changePassword(input);

			expect(response).toMatchObject({ result: { errorCode: 'rate-limited', ok: false }, retryAfterSeconds: 240 });
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		it('has no wait for a 429 without Retry-After', async () => {
			const response = await new SecurityClient({ fetcher: respond(429, FAILURE('rate-limited')) }).changePassword(input);

			expect(response.retryAfterSeconds).toBeUndefined();
		});

		it('reports a real 401 of the change itself once it has settled (the session is gone)', async () => {
			const listener = vi.fn();

			unsubscribers.push(subscribeToApiAccessFailures(listener));

			const response = await new SecurityClient({ fetcher: respond(401, FAILURE('unauthenticated')) }).changePassword(input);

			expect(response.result).toMatchObject({ errorCode: 'unauthenticated', ok: false });
			expect(listener).toHaveBeenCalledWith('unauthenticated');
		});

		it('gives the change a timeout, so the 401s held meanwhile are settled soon', async () => {
			const fetcher = respond(200, { ok: true, revokedSessionCount: 0 });

			await new SecurityClient({ fetcher }).changePassword(input);
			expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
		});

		it.each([
			[true, 0],
			[false, 1]
		])('after a change without an answer asks the session (alive: %s) before reporting the held 401s', async (alive, reports) => {
			const listener = vi.fn();

			unsubscribers.push(subscribeToApiAccessFailures(listener));

			let failPassword: (error: Error) => void = () => undefined;
			const fetcher = vi.fn<typeof globalThis.fetch>((url) => {
				if (typeof url === 'string' && url.endsWith('/password')) {
					return new Promise<Response>((_resolve, reject) => {
						failPassword = reject;
					});
				}

				if (typeof url === 'string' && url.endsWith('/api/auth/session')) {
					return Promise.resolve(new Response(JSON.stringify(alive
						? {
							authenticated: true,
							hasPassword: true,
							household: null,
							telegram: null,
							user: { displayName: 'Сергей', id: 'u', username: 'sergei' }
						}
						: { authenticated: false }), { status: 200 }));
				}

				return Promise.resolve(new Response(JSON.stringify(FAILURE('unauthenticated')), { status: 401 }));
			});
			const client = new SecurityClient({ fetcher });
			const change = client.changePassword(input).catch((error: unknown) => error);

			await client.listSessions();
			failPassword(new DOMException('The operation timed out.', 'TimeoutError'));
			expect(await change).toBeInstanceOf(DOMException);
			expect(fetcher.mock.calls.some(([url]) => url === '/api/auth/session')).toBe(true);
			expect(listener).toHaveBeenCalledTimes(reports);
		});

		it('reports a 401 held during a change that was refused, even when the refusal came with a 2xx', async () => {
			const listener = vi.fn();

			unsubscribers.push(subscribeToApiAccessFailures(listener));

			let answerPassword: (response: Response) => void = () => undefined;
			const fetcher: typeof globalThis.fetch = (url) => (typeof url === 'string' && url.endsWith('/password')
				? new Promise<Response>((resolve) => {
					answerPassword = resolve;
				})
				: Promise.resolve(new Response(JSON.stringify(FAILURE('unauthenticated')), { status: 401 })));
			const client = new SecurityClient({ fetcher });
			const change = client.changePassword(input);

			await client.listSessions();
			expect(listener).not.toHaveBeenCalled();
			answerPassword(new Response(JSON.stringify(FAILURE('invalid-current-password')), { status: 200 }));
			await change;
			expect(listener).toHaveBeenCalledWith('unauthenticated');
		});

		it('ignores a 401 of another request that was in flight during a successful change', async () => {
			const listener = vi.fn();

			unsubscribers.push(subscribeToApiAccessFailures(listener));

			let releasePassword: (response: Response) => void = () => undefined;
			const fetcher: typeof globalThis.fetch = (url) => (typeof url === 'string' && url.endsWith('/password')
				? new Promise<Response>((resolve) => {
					releasePassword = resolve;
				})
				: Promise.resolve(new Response(JSON.stringify(FAILURE('unauthenticated')), { status: 401 })));
			const client = new SecurityClient({ fetcher });
			const change = client.changePassword(input);

			// The list read with the old cookie answers 401 while the change is still being answered.
			await expect(client.listSessions()).resolves.toMatchObject({ errorCode: 'unauthenticated', ok: false });
			releasePassword(new Response(JSON.stringify({ ok: true, revokedSessionCount: 0 }), { status: 200 }));
			await change;
			expect(listener).not.toHaveBeenCalled();
		});
	});
});
