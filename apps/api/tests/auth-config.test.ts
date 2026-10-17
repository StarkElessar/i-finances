import { getAuthConfig } from '@/modules/auth';

import { describe, expect, it } from 'vitest';

describe('getAuthConfig trustedProxyCount', () => {
	it('defaults to zero so that no forwarding header is trusted', () => {
		expect(getAuthConfig({}).trustedProxyCount).toBe(0);
	});

	it('reads TRUSTED_PROXY_COUNT from the environment', () => {
		expect(getAuthConfig({ TRUSTED_PROXY_COUNT: '1' }).trustedProxyCount).toBe(1);
		expect(getAuthConfig({ TRUSTED_PROXY_COUNT: '10' }).trustedProxyCount).toBe(10);
	});

	it.each(['-1', '11', 'abc', '1.5'])('rejects TRUSTED_PROXY_COUNT=%s', (value) => {
		expect(() => getAuthConfig({ TRUSTED_PROXY_COUNT: value })).toThrow();
	});

	it.each([undefined, '', '  '])('refuses to start in production when TRUSTED_PROXY_COUNT is %j', (value) => {
		expect(() => getAuthConfig({ NODE_ENV: 'production', TRUSTED_PROXY_COUNT: value })).toThrow(/TRUSTED_PROXY_COUNT/);
	});

	it('accepts an explicit value in production, including 0 for an API without a proxy', () => {
		expect(getAuthConfig({ NODE_ENV: 'production', TRUSTED_PROXY_COUNT: '1' }).trustedProxyCount).toBe(1);
		expect(getAuthConfig({ NODE_ENV: 'production', TRUSTED_PROXY_COUNT: '0' }).trustedProxyCount).toBe(0);
	});
});
