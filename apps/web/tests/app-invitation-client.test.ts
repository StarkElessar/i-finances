import { AppInvitationClient } from '@/features/app-invitation/api/app-invitation-client';

import { describe, expect, it, vi } from 'vitest';

function respond(body: unknown, status = 200, retryAfter?: string) {
	return new Response(JSON.stringify(body), { headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter }, status });
}

describe('AppInvitationClient', () => {
	it('lists, creates and revokes via cookie HTTP; URLs and list never contain a token', async () => {
		const created = { expiresAt: '2026-11-03T12:00:00.000Z', id: 'one', link: `https://ifinances.example/invite#${'x'.repeat(43)}` };
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(respond({ invitations: [], ok: true }))
			.mockResolvedValueOnce(respond({ invitation: created, ok: true }, 201))
			.mockResolvedValueOnce(respond({ ok: true }));
		const client = new AppInvitationClient({ fetcher });

		await expect(client.list()).resolves.toEqual({ invitations: [], ok: true });
		await expect(client.create({ note: 'Мария' })).resolves.toEqual({ invitation: created, ok: true });
		await client.revoke('one/two');
		expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method, init?.credentials, init?.body])).toEqual([
			['/api/app-invitations', 'GET', 'same-origin', undefined],
			['/api/app-invitations', 'POST', 'same-origin', JSON.stringify({ note: 'Мария' })],
			['/api/app-invitations/one%2Ftwo/revoke', 'POST', 'same-origin', '{}']
		]);
	});

	it('preserves Retry-After and domain field errors', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(respond({ errorCode: 'rate-limited', message: '50 за сутки', ok: false }, 429, '241'))
			.mockResolvedValueOnce(respond({
				errorCode: 'invalid-input', fieldErrors: { note: 'Ошибка' }, message: 'Проверьте', ok: false
			}, 400));
		const client = new AppInvitationClient({ fetcher });

		await expect(client.create({})).resolves.toMatchObject({ errorCode: 'rate-limited', ok: false, retryAfterSeconds: 241 });
		await expect(client.create({ note: 'Мария' })).resolves.toMatchObject({ fieldErrors: { note: 'Ошибка' }, ok: false });
	});

	it.each([403, 404])('keeps HTTP %i without a contract failure distinguishable as access lost', async (status) => {
		const client = new AppInvitationClient({
			fetcher: async () => respond({ error: { code: 'not_found', message: 'Not found' }, ok: false }, status)
		});

		await expect(client.list()).rejects.toMatchObject({ status });
	});

	it('keeps a domain 404 invitation-not-found inside the confirmation', async () => {
		const client = new AppInvitationClient({
			fetcher: async () => respond({ errorCode: 'invitation-not-found', message: 'Уже недействительно', ok: false }, 404)
		});

		await expect(client.revoke('one')).resolves.toMatchObject({ errorCode: 'invitation-not-found', ok: false });
	});
});
