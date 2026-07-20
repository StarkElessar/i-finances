import { afterEach, describe, expect, it } from 'vitest';

import { isSameOriginMutation } from '../../../src/server/auth/csrf/origin-guard';

describe('isSameOriginMutation', () => {
    afterEach(() => {
        delete process.env.AUTH_ORIGIN;
    });

    it('accepts a same-origin Origin header', () => {
        const request = new Request('http://localhost:5173/sign-in', {
            method: 'POST',
            headers: {
                origin: 'http://localhost:5173'
            }
        });

        expect(isSameOriginMutation(request)).toBe(true);
    });

    it('accepts the configured auth origin', () => {
        process.env.AUTH_ORIGIN = 'https://finance.test';

        const request = new Request('http://127.0.0.1:5173/sign-in', {
            method: 'POST',
            headers: {
                origin: 'https://finance.test'
            }
        });

        expect(isSameOriginMutation(request)).toBe(true);
    });

    it('rejects cross-origin and missing origin hints', () => {
        const crossOriginRequest = new Request('http://localhost:5173/sign-in', {
            method: 'POST',
            headers: {
                origin: 'https://evil.test'
            }
        });
        const requestWithoutOrigin = new Request('http://localhost:5173/sign-in', {
            method: 'POST'
        });

        expect(isSameOriginMutation(crossOriginRequest)).toBe(false);
        expect(isSameOriginMutation(requestWithoutOrigin)).toBe(false);
    });
});
