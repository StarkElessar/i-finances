import { createApiApp } from '@/app';
import type { ExchangeRateHttpController } from '@/http/exchange-rate-controller';
import { securityHeaders } from '@/http/security-headers';
import type { ApiEnvironment } from '@/http/types';

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

function expectSecurityHeaders(response: Response): void {
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	expect(response.headers.get('x-frame-options')).toBe('DENY');
	expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	expect(response.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
}

describe('security headers', () => {
	it('are set on successful API responses', async () => {
		const response = await createApiApp().request('/api/health');

		expect(response.status).toBe(200);
		expectSecurityHeaders(response);
	});

	it('are set on not-found responses', async () => {
		const response = await createApiApp().request('/api/does-not-exist');

		expect(response.status).toBe(404);
		expectSecurityHeaders(response);
	});

	it('are set on responses produced by the error handler', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const failingController = {
			current: () => (): never => {
				throw new Error('boom');
			}
		} as unknown as ExchangeRateHttpController;
		const response = await createApiApp({ exchangeRateController: failingController }).request('/api/exchange-rates/current');

		expect(response.status).toBe(500);
		expectSecurityHeaders(response);

		consoleError.mockRestore();
	});

	it('are set on hand-built Response objects and replace weaker values', async () => {
		const app = new Hono<ApiEnvironment>();

		app.use('*', securityHeaders());
		app.get('/raw', () => new Response('raw', { headers: { 'x-frame-options': 'SAMEORIGIN' } }));

		const response = await app.request('/raw');

		expect(await response.text()).toBe('raw');
		expectSecurityHeaders(response);
	});

	it('do not add a Content-Security-Policy', async () => {
		const response = await createApiApp().request('/api/health');

		expect(response.headers.get('content-security-policy')).toBeNull();
	});
});
