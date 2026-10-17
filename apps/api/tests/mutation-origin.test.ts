import { isSameOriginMutation } from '@/http/mutation-origin';

import { afterEach, describe, expect, it } from 'vitest';

describe('isSameOriginMutation', () => {
	afterEach(() => {
		delete process.env.AUTH_ORIGIN;
	});

	it('accepts a same-origin Origin header', () => {
		const request = new Request('http://localhost:5173/sign-in', {
			headers: {
				origin: 'http://localhost:5173'
			},
			method: 'POST'
		});

		expect(isSameOriginMutation(request)).toBe(true);
	});

	it('accepts the configured auth origin', () => {
		process.env.AUTH_ORIGIN = 'https://finance.test';

		const request = new Request('http://127.0.0.1:5173/sign-in', {
			headers: {
				origin: 'https://finance.test'
			},
			method: 'POST'
		});

		expect(isSameOriginMutation(request)).toBe(true);
	});

	it('rejects cross-origin and missing origin hints', () => {
		const crossOriginRequest = new Request('http://localhost:5173/sign-in', {
			headers: {
				origin: 'https://evil.test'
			},
			method: 'POST'
		});
		const requestWithoutOrigin = new Request('http://localhost:5173/sign-in', {
			method: 'POST'
		});

		expect(isSameOriginMutation(crossOriginRequest)).toBe(false);
		expect(isSameOriginMutation(requestWithoutOrigin)).toBe(false);
	});

	it('rejects a request with neither Origin nor Referer', () => {
		expect(isSameOriginMutation(new Request('http://localhost:5173/sign-in', { method: 'POST' }))).toBe(false);
	});

	it('accepts a valid Referer when there is no Origin header', () => {
		const request = new Request('http://localhost:5173/sign-in', {
			headers: { referer: 'http://localhost:5173/login' },
			method: 'POST'
		});

		expect(isSameOriginMutation(request)).toBe(true);
	});

	it('rejects a null Origin even when the Referer is valid', () => {
		const request = new Request('http://localhost:5173/sign-in', {
			headers: {
				origin: 'null',
				referer: 'http://localhost:5173/login'
			},
			method: 'POST'
		});

		expect(isSameOriginMutation(request)).toBe(false);
	});

	it('rejects an unparseable or empty Origin even when the Referer is valid', () => {
		for (const origin of ['not a url', '']) {
			const request = new Request('http://localhost:5173/sign-in', {
				headers: {
					origin,
					referer: 'http://localhost:5173/login'
				},
				method: 'POST'
			});

			expect(isSameOriginMutation(request)).toBe(false);
		}
	});

	it('rejects a foreign Origin even when the Referer is same-origin', () => {
		const request = new Request('http://localhost:5173/sign-in', {
			headers: {
				origin: 'https://evil.test',
				referer: 'http://localhost:5173/login'
			},
			method: 'POST'
		});

		expect(isSameOriginMutation(request)).toBe(false);
	});
});
