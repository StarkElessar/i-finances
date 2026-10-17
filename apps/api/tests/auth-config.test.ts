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
});
