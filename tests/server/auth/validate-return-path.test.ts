import { describe, expect, it } from 'vitest';

import { validateReturnPath } from '../../../src/server/auth/validate-return-path';

describe('validateReturnPath', () => {
    it('keeps internal application paths', () => {
        expect(validateReturnPath('/accounts?tab=cards#main')).toBe('/accounts?tab=cards#main');
    });

    it('falls back for external and malformed paths', () => {
        expect(validateReturnPath('https://example.com/accounts')).toBe('/');
        expect(validateReturnPath('//example.com/accounts')).toBe('/');
        expect(validateReturnPath('/accounts\\cards')).toBe('/');
    });

    it('does not redirect back to sign-in', () => {
        expect(validateReturnPath('/sign-in')).toBe('/');
    });
});
