import { readClientIp, resolveClientIp } from '@/http/client-ip';
import type { ApiEnvironment } from '@/http/types';

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

const CLIENT_ADDRESS = '203.0.113.7';
const PROXY_ADDRESS = '172.18.0.2';

describe('resolveClientIp', () => {
	it('ignores X-Forwarded-For when no proxy is trusted', () => {
		expect(resolveClientIp({
			forwardedFor: '6.6.6.6',
			socketAddress: CLIENT_ADDRESS,
			trustedProxyCount: 0
		})).toBe(CLIENT_ADDRESS);
	});

	it('takes the address the trusted proxy appended, not the one the client sent first', () => {
		// The client sends `X-Forwarded-For: 6.6.6.6`; nginx appends `$remote_addr`.
		expect(resolveClientIp({
			forwardedFor: `6.6.6.6, ${CLIENT_ADDRESS}`,
			socketAddress: PROXY_ADDRESS,
			trustedProxyCount: 1
		})).toBe(CLIENT_ADDRESS);
	});

	it('cannot be steered by a client that forges a long list', () => {
		expect(resolveClientIp({
			forwardedFor: `1.1.1.1, 2.2.2.2, 3.3.3.3, ${CLIENT_ADDRESS}`,
			socketAddress: PROXY_ADDRESS,
			trustedProxyCount: 1
		})).toBe(CLIENT_ADDRESS);
	});

	it('counts trusted proxies from the right', () => {
		expect(resolveClientIp({
			forwardedFor: `6.6.6.6, ${CLIENT_ADDRESS}, ${PROXY_ADDRESS}`,
			socketAddress: '172.18.0.3',
			trustedProxyCount: 2
		})).toBe(CLIENT_ADDRESS);
	});

	it('falls back to the socket peer when the chain is shorter than expected', () => {
		expect(resolveClientIp({
			forwardedFor: '6.6.6.6',
			socketAddress: CLIENT_ADDRESS,
			trustedProxyCount: 2
		})).toBe(CLIENT_ADDRESS);
	});

	it('falls back to the socket peer when the header is missing or not an address', () => {
		expect(resolveClientIp({ socketAddress: CLIENT_ADDRESS, trustedProxyCount: 1 })).toBe(CLIENT_ADDRESS);
		expect(resolveClientIp({
			forwardedFor: 'not-an-ip',
			socketAddress: CLIENT_ADDRESS,
			trustedProxyCount: 1
		})).toBe(CLIENT_ADDRESS);
		expect(resolveClientIp({
			forwardedFor: '6.6.6.6, ',
			socketAddress: CLIENT_ADDRESS,
			trustedProxyCount: 1
		})).toBe(CLIENT_ADDRESS);
	});

	it('normalizes IPv4-mapped IPv6 and letter case', () => {
		expect(resolveClientIp({
			socketAddress: '::ffff:203.0.113.7',
			trustedProxyCount: 0
		})).toBe(CLIENT_ADDRESS);
		expect(resolveClientIp({
			forwardedFor: '2001:DB8::1',
			socketAddress: PROXY_ADDRESS,
			trustedProxyCount: 1
		})).toBe('2001:db8::1');
	});

	it('returns undefined when nothing trustworthy is known', () => {
		expect(resolveClientIp({ forwardedFor: 'garbage', trustedProxyCount: 1 })).toBeUndefined();
		expect(resolveClientIp({ trustedProxyCount: 0 })).toBeUndefined();
	});
});

describe('readClientIp', () => {
	it('reads the forwarded address through a Hono context', async () => {
		const app = new Hono<ApiEnvironment>();

		app.get('/ip', (context) => context.json({ ip: readClientIp(context, 1) ?? null }));

		const response = await app.request('/ip', {
			headers: { 'x-forwarded-for': `6.6.6.6, ${CLIENT_ADDRESS}` }
		});

		expect(await response.json()).toEqual({ ip: CLIENT_ADDRESS });
	});

	it('ignores a forged header when the proxy count is zero', async () => {
		const app = new Hono<ApiEnvironment>();

		app.get('/ip', (context) => context.json({ ip: readClientIp(context, 0) ?? null }));

		const response = await app.request('/ip', {
			headers: { 'x-forwarded-for': '6.6.6.6' }
		});

		expect(await response.json()).toEqual({ ip: null });
	});
});
