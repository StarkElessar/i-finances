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
});
