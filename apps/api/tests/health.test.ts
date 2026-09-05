import { createApiApp } from '@/app';

import { healthResponseSchema } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

describe('API health endpoint', () => {
	it('returns a contract-valid response without opening a server port', async () => {
		const response = await createApiApp().request('/api/health');
		const body: unknown = await response.json();

		expect(response.status).toBe(200);
		expect(healthResponseSchema.parse(body)).toEqual({
			ok: true,
			service: 'api',
			version: 'workspace-shell'
		});
	});
});
