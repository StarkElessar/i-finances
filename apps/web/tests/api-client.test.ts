import { ApiClient } from '@/shared/api';

import { describe, expect, it } from 'vitest';

describe('ApiClient', () => {
	it('uses same-origin credentials and validates JSON responses', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/health');
			expect(init?.credentials).toBe('same-origin');
			expect(new Headers(init?.headers).get('accept')).toBe('application/json');

			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new ApiClient({ fetcher });

		await expect(client.get('/api/health', {
			parse: (value: unknown) => value as { ok: true }
		})).resolves.toEqual({ ok: true });
	});

	it('preserves status and response body for HTTP failures', async () => {
		const fetcher: typeof globalThis.fetch = async () => new Response(JSON.stringify({
			errorCode: 'unauthenticated',
			ok: false
		}), { status: 401 });
		const client = new ApiClient({ fetcher });

		await expect(client.get('/api/categories', {
			parse: (value: unknown) => value
		})).rejects.toMatchObject({
			body: {
				errorCode: 'unauthenticated',
				ok: false
			},
			status: 401
		});
	});
});
