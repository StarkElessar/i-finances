import { beforeEach, describe, expect, it } from 'vitest';

import {
    checkPasswordSignInRateLimit,
    clearPasswordSignInRateLimit,
    recordPasswordSignInFailure,
    resetPasswordSignInRateLimits
} from '../../../src/server/auth/rate-limit/login-rate-limit';

const WINDOW_MILLISECONDS = 15 * 60 * 1000;

describe('password sign-in rate limit', () => {
    beforeEach(() => {
        resetPasswordSignInRateLimits();
    });

    it('blocks the sixth failed attempt in one window', () => {
        const attempt = {
            ipAddress: '127.0.0.1',
            username: 'sergei',
            now: 1000
        };

        for (let index = 0; index < 5; index += 1) {
            expect(checkPasswordSignInRateLimit(attempt).allowed).toBe(true);
            recordPasswordSignInFailure(attempt);
        }

        expect(checkPasswordSignInRateLimit(attempt)).toEqual({
            allowed: false,
            retryAfterSeconds: 900
        });
    });

    it('resets after the window expires', () => {
        const attempt = {
            ipAddress: '127.0.0.1',
            username: 'sergei',
            now: 1000
        };

        for (let index = 0; index < 5; index += 1) {
            recordPasswordSignInFailure(attempt);
        }

        expect(checkPasswordSignInRateLimit({
            ...attempt,
            now: attempt.now + WINDOW_MILLISECONDS + 1
        }).allowed).toBe(true);
    });

    it('clears failures after a successful sign-in', () => {
        const attempt = {
            ipAddress: '127.0.0.1',
            username: 'sergei',
            now: 1000
        };

        recordPasswordSignInFailure(attempt);
        clearPasswordSignInRateLimit(attempt);

        expect(checkPasswordSignInRateLimit(attempt).allowed).toBe(true);
    });
});
